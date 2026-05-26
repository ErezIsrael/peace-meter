#!/usr/bin/env python3
"""Benchmark AI classification for different batch sizes."""
import sys, os, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import importlib.util
spec = importlib.util.spec_from_file_location("ai_analyze_prod", os.path.join(os.path.dirname(os.path.abspath(__file__)), "ai-analyze-prod.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
SOLUTIONS = mod.SOLUTIONS
SOLUTION_IDS = mod.SOLUTION_IDS
fetch_all_feeds = mod.fetch_all_feeds

LLAMA_CPP_URL = os.environ.get("LLAMA_CPP_URL", "http://192.168.2.121:8080")
LLAMA_API_KEY = os.getenv("LLAMA_API_KEY", "")

def _make_prompt(articles):
    solution_descriptions = "\n".join(
        f"  {sid}: {sol['description']}" for sid, sol in SOLUTIONS.items()
    )
    lines = []
    for i, a in enumerate(articles):
        snippet = a.get('snippet', '')
        if snippet:
            lines.append(f"{i+1}. {a['title']}\n   [{snippet}]")
        else:
            lines.append(f"{i+1}. {a['title']}")
    prompt = "Classify each article into ONE category.\n"
    prompt += "Read snippet carefully. Choose MOST SPECIFIC category.\n"
    prompt += solution_descriptions + "\n"
    prompt += f"\nCategories: {', '.join(SOLUTION_IDS)}\n"
    prompt += '\nOutput ONLY JSON array: [{"solution":"<id>","sentiment":"<pos/neg/neu>","risk":<1-10>}]\n\nArticles:\n'
    prompt += "\n".join(lines)
    return prompt

def _call_api(prompt, max_tokens=8000):
    from urllib.request import Request, urlopen
    body = {
        "model": "Qwen3.6-27B",
        "messages": [
            {"role": "system", "content": "Output ONLY a valid JSON array."},
            {"role": "user", "content": prompt}
        ],
        "max_tokens": max_tokens,
        "temperature": 0.0,
    }
    headers = {"Content-Type": "application/json"}
    if LLAMA_API_KEY:
        headers["Authorization"] = f"Bearer {LLAMA_API_KEY}"
    t0 = time.time()
    req = Request(f"{LLAMA_CPP_URL}/v1/chat/completions", data=json.dumps(body).encode(), headers=headers)
    try:
        with urlopen(req, timeout=120) as f:
            response = json.loads(f.read().decode())
        elapsed = time.time() - t0
        result_text = response.get("choices", [{}])[0].get("message", {}).get("content", "")
        fb = result_text.find('[')
        lb = result_text.rfind(']')
        if fb != -1 and lb > fb:
            try:
                result = json.loads(result_text[fb:lb+1])
                return result, elapsed
            except json.JSONDecodeError:
                pass
        return None, elapsed
    except Exception as e:
        elapsed = time.time() - t0
        print(f"  ERROR: {e}")
        return None, elapsed

def main():
    articles = fetch_all_feeds()
    n = len(articles)
    print(f"Fetched {n} articles\n")

    batch_sizes = [5, 10, 20, 30, 50]
    results = []

    print("=" * 70)
    print("BENCHMARK: Batch Size vs Time & Success Rate")
    print("=" * 70)

    for bs in batch_sizes:
        total_time = 0
        total_ok = 0
        num_batches = (n + bs - 1) // bs

        for i in range(0, n, bs):
            batch = articles[i:i+bs]
            prompt = _make_prompt(batch)
            result, latency = _call_api(prompt)
            total_time += latency
            if result:
                total_ok += len(result)
            sys.stdout.write(f"\r  [{bs:>2}] Batch {i//bs+1}/{num_batches} ({latency:.1f}s)")
            sys.stdout.flush()
        print()

        fail_rate = (n - total_ok) / n * 100 if n > 0 else 0
        results.append((bs, total_time, total_ok, n, total_time / num_batches if num_batches else 0))

    print()
    print(f"{'Batch':>6} {'Batches':>8} {'Time':>8} {'OK/N':>10} {'Fail%':>7}")
    print("-" * 45)
    for bs, tt, ok, total, avg_bt in results:
        nb = (total + bs - 1) // bs
        print(f"{bs:>6} {nb:>8} {tt:>7.1f}s {ok:>3}/{total:>3} {fail_rate:>6.1f}%", fail_rate := (total - ok) / total * 100)

    print(f"\n{'='*70}")
    print("Estimated time for 140 articles:")
    print("-" * 45)
    for bs, _, _, _, avg_bt in results:
        batches = (140 + bs - 1) // bs
        est = avg_bt * batches
        print(f"  bs={bs:>2}: ~{est:.0f}s ({est/60:.1f}min)")

if __name__ == "__main__":
    main()
