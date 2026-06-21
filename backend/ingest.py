import os
from dotenv import load_dotenv
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchIndex,
    SearchField,
    SearchFieldDataType,
    SimpleField,
    SearchableField,
    VectorSearch,
    HnswAlgorithmConfiguration,
    VectorSearchProfile,
)

from azure.core.credentials import AzureKeyCredential
import pathlib
from pypdf import PdfReader
from openai import AzureOpenAI

load_dotenv()

endpoint = os.getenv("AZURE_SEARCH_ENDPOINT")
key = os.getenv("AZURE_SEARCH_KEY")
index_name = os.getenv("AZURE_SEARCH_INDEX")

credential = AzureKeyCredential(key)

index_client = SearchIndexClient(endpoint=endpoint, credential=credential)
search_client = SearchClient(endpoint=endpoint, index_name=index_name, credential=credential)

openai_client = AzureOpenAI(
    azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_key = os.getenv("AZURE_OPENAI_KEY"),
    api_version = "2024-02-01"
)
embedding_deployment = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT") 


def create_index():
    fields = [
        SimpleField(name="id", type=SearchFieldDataType.String, key=True),
        SearchableField(name="content", type=SearchFieldDataType.String),
        SimpleField(name="source", type=SearchFieldDataType.String, filterable=True),
        SearchField(
            name="embedding",
            type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
            searchable=True,
            vector_search_dimensions=1536,
            vector_search_profile_name="my-vector-profile",
        ),
    ]

    vector_search = VectorSearch(
        algorithms=[HnswAlgorithmConfiguration(name="my-hnsw")],
        profiles=[VectorSearchProfile(name="my-vector-profile", algorithm_configuration_name="my-hnsw")],
    )

    index = SearchIndex(name=index_name, fields=fields, vector_search=vector_search)
    index_client.create_or_update_index(index)
    print(f"Index '{index_name}' created/updated successfully.")



def embed(text: str) -> list[float]:
    response = openai_client.embeddings.create(
        input=text,
        model=embedding_deployment,
    )
    return response.data[0].embedding


def chunk_pdf(file_path, chunk_size=1000, overlap=100):
    reader = PdfReader(file_path)
    text = ""
    for page in reader.pages:
        text += page.extract_text()
    
    chunks = []
    start = 0
    while start<len(text):
        end = start + chunk_size
        chunk = text[start:end]
        chunks.append({
            "id": f"{file_path.stem}_{start}",
            "content":chunk,
            "source": str(file_path),
            "embedding": embed(chunk),
        })
        start = end - overlap

    return chunks



def ingest_files():
    data_path = pathlib.Path("data/community-notes")
    pdf_files = list(data_path.rglob("*.pdf"))
    all_chunks = []
    for file in pdf_files:
        chunks = chunk_pdf(file)
        all_chunks += chunks
    search_client.upload_documents(documents=all_chunks)
    print(f"Uploaded {len(all_chunks)} chunks to index '{index_name}'")



if __name__ == "__main__":
    create_index()
    ingest_files()
        

