#!/usr/bin/env python3
"""Test batch-5 classification accuracy."""
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

def _call_api(prompt):
    from urllib.request import Request, urlopen
    body = {
        "model": "Qwen3.6-27B",
        "messages": [
            {"role": "system", "content": "Output ONLY a valid JSON array."},
            {"role": "user", "content": prompt}
        ],
        "max_tokens": 8000,
        "temperature": 0.0,
    }
    headers = {"Content-Type": "application/json"}
    if LLAMA_API_KEY:
        headers["Authorization"] = f"Bearer {LLAMA_API_KEY}"
    req = Request(f"{LLAMA_CPP_URL}/v1/chat/completions", data=json.dumps(body).encode(), headers=headers)
    with urlopen(req, timeout=120) as f:
        response = json.loads(f.read().decode())
    result_text = response.get("choices", [{}])[0].get("message", {}).get("content", "")
    fb, lb = result_text.find('['), result_text.rfind(']')
    if fb != -1 and lb > fb:
        return json.loads(result_text[fb:lb+1])
    return None

def main():
    articles = fetch_all_feeds()
    print(f"Fetched {len(articles)} articles, classifying in batches of 5...\n")

    all_results = []
    batch_size = 5
    for i in range(0, len(articles), batch_size):
        batch = articles[i:i+batch_size]
        prompt = _make_prompt(batch)
        result = _call_api(prompt)
        if result:
            all_results.extend(result)
        else:
            print(f"  Batch {i//batch_size+1}: FAILED")
        sys.stdout.write(f"\r  [{i//batch_size+1}/{(len(articles)+4)//5}]")
        sys.stdout.flush()
    print()

    # Group by solution
    from collections import Counter
    cats = Counter(r['solution'] for r in all_results)
    print(f"\nResults: {len(all_results)} classified")
    for cat, cnt in cats.most_common():
        print(f"  {cat:25s} {cnt:>3}")

    # Check for likely misclassifications
    print(f"\nPotential misclassifications:")
    for j, r in enumerate(all_results):
        article = articles[j]
        title_lower = article['title'].lower()
        snip_lower = article.get('snippet', '').lower()
        sol = r['solution']

        # Heuristic: if article title mentions a country/region different from assigned category
        if sol == 'iran' and ('lebanon' in title_lower or 'hezbollah' in title_lower or 'beirut' in title_lower):
            print(f"  [{sol}] {article['title'][:70]}")
        elif sol == 'lebanon' and ('iran' in title_lower or 'tehran' in title_lower or 'hormuz' in title_lower):
            print(f"  [{sol}] {article['title'][:70]}")
        elif sol == 'west-bank' and ('iran' in title_lower or 'lebanon' in title_lower):
            print(f"  [{sol}] {article['title'][:70]}")
        elif sol == 'gaza-crisis' and ('lebanon' in title_lower or 'hezbollah' in title_lower):
            print(f"  [{sol}] {article['title'][:70]}")

if __name__ == "__main__":
    main()
