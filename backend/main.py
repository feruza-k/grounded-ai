import os 
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel 

from openai import AzureOpenAI, BadRequestError
from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient
from azure.search.documents.models import VectorizedQuery
from azure.ai.textanalytics import TextAnalyticsClient
from azure.ai.contentsafety import ContentSafetyClient
from azure.ai.contentsafety.models import AnalyzeTextOptions

load_dotenv()

app=FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class AskRequest(BaseModel):
    question: str

class QuizResponse(BaseModel):
    question: str
    options: list[str]
    answer: str
    explanation: str
    source: str

openai_client = AzureOpenAI(
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_key=os.getenv("AZURE_OPENAI_KEY"),
    api_version="2024-02-01",
)

search_client = SearchClient(
    endpoint=os.getenv("AZURE_SEARCH_ENDPOINT"),
    index_name=os.getenv("AZURE_SEARCH_INDEX"),
    credential=AzureKeyCredential(os.getenv("AZURE_SEARCH_KEY")),
)

language_client = TextAnalyticsClient(
    endpoint=os.getenv("AZURE_LANGUAGE_ENDPOINT"),
    credential=AzureKeyCredential(os.getenv("AZURE_LANGUAGE_KEY")),
)

content_safety_client = ContentSafetyClient(
    endpoint=os.getenv("AZURE_CONTENT_SAFETY_ENDPOINT"),
    credential=AzureKeyCredential(os.getenv("AZURE_CONTENT_SAFETY_KEY")),
)


def embed(text: str) -> list[float]:
    response = openai_client.embeddings.create(
        input=text,
        model=os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT"),
    )
    return response.data[0].embedding

def check_safety(text: str) -> bool:
    response = content_safety_client.analyze_text(AnalyzeTextOptions(text=text))
    for category in response.categories_analysis:
        if category.severity >= 2:
            return False
    return True

@app.post("/ask")
def ask(request: AskRequest):
    if not check_safety(request.question):
        raise HTTPException(status_code=400, detail="Input flagged by content safety.")
    # Step 1: Entity Extraction
    entity_response = language_client.recognize_entities([request.question])
    entities = [e.text for e in entity_response[0].entities]
    enhances_query = " ".join(entities) if entities else request.question

    # Step 2: Vector Search
    query_vector = embed(enhances_query)
    vector_query = VectorizedQuery(
        vector=query_vector,
        k_nearest_neighbors=5,  # Number of top documents to retrieve
        fields="embedding",
    )

    results = list(search_client.search(
        search_text=None,
        vector_queries=[vector_query],
        select=["content", "source"],
    ))

    # Step 3: Build grounded prompt
    context = "\n\n".join(
        f"Source: {r['source']}\nContent: {r['content']}" for r in results
    )
    messages = [
        {
            "role": "system", 
            "content": (
                """You are a helpful assistant. Answer the user's question using ONLY
                  the provided context. If the answer is not in the context, say so.
                  Do not mention source filenames in your answer text."""
            ),
        },
        {"role": "user", 
         "content": f"Context:\n{context}\n\nQuestion: {request.question}",
        },
    ]

    #Step 4: Generate answer using Azure OpenAI
    try:
        completion = openai_client.chat.completions.create(
            messages=messages,
            model=os.getenv("AZURE_OPENAI_DEPLOYMENT"),
            )
    except BadRequestError as e:
        raise HTTPException(status_code=400, detail="Request blocked by Azure OpenAI content policy.")
    
    
    answer = completion.choices[0].message.content
    if not check_safety(answer):
        raise HTTPException(status_code=400, detail="Output flagged by content safety.")
    citation = list({r['source'] for r in results})

    return {"answer": answer, "citation": citation}


@app.post("/quiz", response_model=QuizResponse)
def quiz():
    results = list(search_client.search(
        search_text="*",
        top=3,
        select=["content", "source"],
    ))

    context = "\n\n".join(
        f"Source: {r['source']}\nContent: {r['content']}" for r in results
    )

    messages = [
        {
            "role": "system",
            "content": (
                "You are an Azure AI-102 exam question writer. Given study material, generate ONE "
                "scenario-based multiple-choice question. The question must describe a real-world "
                "business situation and ask which Azure AI service or approach best solves it. "
                "Use exactly 4 options labeled A, B, C, D — one clearly correct, three plausible but wrong. "
                "Respond in this exact format:\n"
                "Question: <scenario-based question>\n"
                "A: <option>\n"
                "B: <option>\n"
                "C: <option>\n"
                "D: <option>\n"
                "Answer: <correct letter>\n"
                "Explanation: <one sentence explaining why the answer is correct>"
            ),
        },
        {
            "role": "user",
            "content": f"Generate a question from this material:\n\n{context}",
        },
    ]

    try:
        completion = openai_client.chat.completions.create(
            model=os.getenv("AZURE_OPENAI_DEPLOYMENT"),
            messages=messages,
        )
    except BadRequestError:
        raise HTTPException(status_code=400, detail="Quiz generation blocked by content policy.")

    raw = completion.choices[0].message.content
    lines = [l.strip() for l in raw.strip().splitlines() if l.strip()]

    question = lines[0].replace("Question: ", "")
    options = [l for l in lines if l.startswith(("A:", "B:", "C:", "D:"))]
    answer_line = next((l for l in lines if l.startswith("Answer:")), "")
    answer = answer_line.replace("Answer: ", "")
    explanation_line = next((l for l in lines if l.startswith("Explanation:")), "")
    explanation = explanation_line.replace("Explanation: ", "")
    source = results[0]["source"] if results else ""

    return QuizResponse(question=question, options=options, answer=answer, explanation=explanation, source=source)