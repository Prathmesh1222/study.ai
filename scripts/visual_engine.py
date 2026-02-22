import json
import re
import google.generativeai as genai

class VisualEngine:
    def __init__(self, llm_model):
        self.llm = llm_model

    def _clean_json_response(self, text):
        try:
            match = re.search(r'(\[.*\]|\{.*\})', text, re.DOTALL)
            if match: return json.loads(match.group(1))
            return json.loads(text)
        except:
            return None

    def generate_mind_map(self, query, context):
        prompt = f"""
        Role: Visual Learning Assistant.
        Task: Generate a Mind Map for: "{query}"
        Context: {context}
        
        CRITICAL RULES:
        1. OUTPUT STRICT JSON ONLY.
        2. DO NOT include edge labels or relationship descriptions (like "Is-A", "Has-A", "Part-Of"). 
        3. JUST show the hierarchy of concepts.
        4. Keep nodes SHORT (1-3 words).
        
        Format: {{\"topic\": \"Main Topic\", \"branches\": {{\"Branch1\": [\"Leaf1\", \"Leaf2\"], \"Branch2\": [\"Leaf3\"]}}}}
        """
        try:
            res = self.llm.generate_content(prompt).text
            data = self._clean_json_response(res)
            if not data: return {"topic": "Error", "branches": {"Parse Error": ["Try again"]}}
            return data
        except Exception as e:
            return {"topic": "Error", "branches": {f"Error": ["Check API Key"]}}