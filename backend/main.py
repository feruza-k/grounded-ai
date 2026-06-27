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

class QuizRequest(BaseModel):
    topic: str
    question_type: str  # "single" or "multi"

class QuizResponse(BaseModel):
    question: str
    options: list[str]
    answer: list[str]
    explanation: str
    source: str
    question_type: str
    topic: str


TOPIC_KEYWORDS = {
    "plan_manage": "Azure AI resource management monitoring security responsible AI content safety",
    "generative_ai": "Azure OpenAI generative AI RAG prompt engineering model deployment fine-tuning",
    "agentic": "Azure AI agent Semantic Kernel AutoGen multi-agent orchestration workflow",
    "computer_vision": "Azure AI Vision image analysis object detection custom vision video indexer",
    "nlp": "Azure AI Language natural language processing text analytics speech translation",
    "knowledge_mining": "Azure AI Search document intelligence indexer skillset knowledge mining",
}

TOPIC_LABELS = {
"plan_manage": "Plan and Manage Azure AI Solutions",
"generative_ai": "Implement Generative AI Solutions",
"agentic": "Implement Agentic Solutions",
"computer_vision": "Implement Computer Vision Solutions",
"nlp": "Implement Natural Language Processing Solutions",
"knowledge_mining": "Implement Knowledge Mining Solutions",
}

openai_client = AzureOpenAI(
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_key=os.getenv("AZURE_OPENAI_KEY"),
    api_version="2024-02-01",
    timeout=30.0,  # fail fast instead of hanging indefinitely
    max_retries=1,
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
def quiz(request: QuizRequest):
    topic_label = TOPIC_LABELS.get(request.topic, request.topic)
    search_keywords = TOPIC_KEYWORDS.get(request.topic, request.topic)

    query_vector = embed(search_keywords)
    vector_query = VectorizedQuery(
        vector=query_vector,
        k_nearest_neighbors=5,
        fields="embedding",
    )
    results = list(search_client.search(
        search_text=None,
        vector_queries=[vector_query],
        select=["content", "source"],
        top=5,
    ))

    context = "\n\n".join(f"Source: {r['source']}\nContent: {r['content']}" for r in results)

    if request.question_type == "multi":
        format_instructions = (
            "Write exactly 5 options labeled A, B, C, D, E. "
            "EXACTLY TWO options are correct, three are wrong. "
            "The question must end with: 'Which TWO should you choose? Each correct answer presents part of the solution.'\n"
            "Answer: <two letters separated by a comma, e.g. A, C>"
        )
    else:
        format_instructions = (
            "Write exactly 4 options labeled A, B, C, D. "
            "ONE option is correct, three are plausible but wrong. "
            "The question must end with: 'What should you do?'\n"
            "Answer: <single letter>"
        )

    system_prompt = (
        f"You are an Azure AI-102 exam question writer in the style of MeasureUp certification tests. "
        f"Domain: {topic_label}. "
        f"Write ONE scenario-based question following these rules:\n"
        f"- Start with 'You are...' or 'Your company...' to describe a real-world situation\n"
        f"- Include 'You need to...' to state the requirement clearly\n"
        f"- Only use services and concepts from the provided study material\n"
        f"- {format_instructions}\n"
        f"- Write a detailed explanation: why the correct answer is right AND why each wrong answer is incorrect\n\n"
        f"Respond in EXACTLY this format:\n"
        f"Question: <full scenario question>\n"
        f"A: <option>\nB: <option>\nC: <option>\nD: <option>\n"
        f"{'E: <option>' + chr(10) if request.question_type == 'multi' else ''}"
        f"Answer: <answer>\n"
        f"Explanation: <detailed explanation>"
    )

    try:
        completion = openai_client.chat.completions.create(
            model=os.getenv("AZURE_OPENAI_DEPLOYMENT"),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Generate a question from this material:\n\n{context}"},
            ],
        )
    except BadRequestError:
        raise HTTPException(status_code=400, detail="Quiz generation blocked by content policy.")

    raw = completion.choices[0].message.content
    lines = [l.strip() for l in raw.strip().splitlines() if l.strip()]

    question = next((l.replace("Question: ", "") for l in lines if l.startswith("Question:")), "")
    answer_idx = next((i for i, l in enumerate(lines) if l.startswith("Answer:")), len(lines))
    options = [l for l in lines[:answer_idx] if l.startswith(("A:", "B:", "C:", "D:", "E:"))]
    answer_line = next((l for l in lines if l.startswith("Answer:")),"")
    answer = [a.strip() for a in answer_line.replace("Answer: ", "").split(",")]
    explanation_idx = next((i for i, l in enumerate(lines) if l.startswith("Explanation:")), -1)
    explanation = "".join(lines[explanation_idx:]).replace("Explanation: ", "") if explanation_idx >= 0 else ""
    source = results[0]["source"] if results else ""

    return QuizResponse(
        question=question,
        options=options,
        answer=answer,
        explanation=explanation,
        source=source,
        question_type=request.question_type,
        topic=request.topic,
    )