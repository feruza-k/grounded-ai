import os 
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel 

from openai import AzureOpenAI
from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient
from azure.search.documents.models import VectorizedQuery
from azure.ai.textanalytics import TextAnalyticsClient
from azure.ai.contentsafety import ContentSafetyClient

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

@app.post("/ask")
def ask(request: AskRequest):
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
                  Always cite the source document name in your answer."""
            ),
        },
        {"role": "user", 
         "content": f"Context:\n{context}\n\nQuestion: {request.question}",
        },
    ]

    #Step 4: Generate answer using Azure OpenAI
    completion = openai_client.chat.completions.create(
        messages=messages,
        model=os.getenv("AZURE_OPENAI_DEPLOYMENT"),
    )
    answer = completion.choices[0].message.content
    citation = list({r['source'] for r in results})

    return {"answer": answer, "citation": citation}

