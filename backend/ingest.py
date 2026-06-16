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
)
from azure.core.credentials import AzureKeyCredential
import pathlib


load_dotenv()

endpoint = os.getenv("AZURE_SEARCH_ENDPOINT")
key = os.getenv("AZURE_SEARCH_KEY")
index_name = os.getenv("AZURE_SEARCH_INDEX")

credential = AzureKeyCredential(key)

index_client = SearchIndexClient(endpoint=endpoint, credential=credential)
search_client = SearchClient(endpoint=endpoint, index_name=index_name, credential=credential)



def create_index():
    fields = [
        SimpleField(name="id", type=SearchFieldDataType.String, key=True),
        SearchableField(name="content", type=SearchFieldDataType.String),
        SimpleField(name="source", type=SearchFieldDataType.String, filterable=True)
        ]

    index = SearchIndex(name=index_name, fields=fields)
    index_client.create_or_update_index(index)
    print(f"Index '{index_name}' created successfully.")


def chunk_markdown(file_path, chunk_size=1000, overlap=100):
    with open(file_path, "r", encoding="utf-8") as f:
        text = f.read()
    
    chunks = []
    start = 0
    while start<len(text):
        end = start + chunk_size
        chunk = text[start:end]
        chunks.append({
            "id": f"{file_path.stem}_{start}",
            "content":chunk,
            "source": str(file_path)
        })
        start = end - overlap

    return chunks
