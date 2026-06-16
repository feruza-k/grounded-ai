# anchor

RAG-powered Q&A assistant that grounds answers in official documentation, built with Azure AI Search, Azure OpenAI, and Azure AI Language.

## What it does

You ask a question about a topic covered in the indexed documentation. The system retrieves the most relevant chunks from an Azure AI Search index, extracts key entities from your query using Azure AI Language to sharpen retrieval, and generates an answer using Azure OpenAI — grounded in and citing the source material rather than relying on the model's own training data.

## Architecture

1. PDF documents are ingested and split into chunks
2. Chunks are embedded and stored in an Azure AI Search index
3. A user query is run through Azure AI Language to extract key entities
4. Extracted entities sharpen the retrieval query against the search index
5. Top-matching chunks are retrieved and passed to Azure OpenAI as context
6. Azure OpenAI generates an answer grounded in the retrieved chunks
7. Input and output are checked through Azure AI Content Safety before being returned
8. The response is returned with citations to the source chunks

## Tech stack

- **Backend:** FastAPI, Python
- **Frontend:** React
- **Retrieval:** Azure AI Search (vector + semantic search)
- **Generation:** Azure OpenAI (gpt-4.1-mini)
- **Query enhancement:** Azure AI Language (entity extraction)
- **Safety:** Azure AI Content Safety

## Running locally

### Prerequisites
- Python 3.11+
- Node.js 18+
- Azure subscription with the following resources deployed:
  - Azure AI Foundry project (gpt-4.1-mini deployed)
  - Azure AI Search
  - Azure AI Language
  - Azure AI Content Safety

### Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in `backend/` with:

```
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_KEY=
AZURE_OPENAI_DEPLOYMENT=
AZURE_SEARCH_ENDPOINT=
AZURE_SEARCH_KEY=
AZURE_SEARCH_INDEX_NAME=
AZURE_LANGUAGE_ENDPOINT=
AZURE_LANGUAGE_KEY=
AZURE_CONTENT_SAFETY_ENDPOINT=
AZURE_CONTENT_SAFETY_KEY=
```

Run the backend:

```bash
uvicorn main:app --reload
```

### Frontend setup

```bash
cd frontend
npm install
npm run dev
```

### Ingesting documents

Place PDF files in `backend/data/` and run:

```bash
python ingest.py
```

This chunks the documents and uploads them to the Azure AI Search index.

## Why I built this

I built this while preparing for the Azure AI Engineer Associate (AI-102) certification, as a way to implement and demonstrate the Azure AI services covered on the exam — retrieval-augmented generation, query understanding, and responsible AI safety checks — in a working application rather than just studying them in isolation.

## Notes

This project uses Azure AI services as a customer of the Azure platform. It is not affiliated with or endorsed by Microsoft.