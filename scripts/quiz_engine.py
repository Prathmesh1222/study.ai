import json
import re

class QuizEngine:
    def __init__(self, llm_model):
        self.llm = llm_model

    def _clean_json_response(self, text):
        try:
            match = re.search(r'(\[.*\])', text, re.DOTALL)
            if match: return json.loads(match.group(1))
            return json.loads(text)
        except:
            return []

    def generate_quiz(self, topic, context, num_questions=5):
        prompt = f"""
        Role: Professor.
        Task: Create a hard {num_questions}-question MCQ quiz for: "{topic}"
        Context: {context}
        
        CONSTRAINT: Do not focus questions on 'Is-A' vs 'Has-A' relationships definitions. Focus on code behavior and output.
        
        OUTPUT FORMAT: A raw JSON List.
        [
            {{
                "id": 1,
                "question": "Question text?",
                "options": ["A) Opt1", "B) Opt2"],
                "correct_answer": "B) Opt2",
                "explanation": "Why..."
            }}
        ]
        """
        try:
            response = self.llm.generate_content(prompt).text
            return self._clean_json_response(response)
        except:
            return []