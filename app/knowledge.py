from functools import lru_cache
from pinecone import Pinecone, ServerlessSpec
from app.config import settings

EMBEDDING_MODEL = 'sentence-transformers/all-MiniLM-L6-v2'
EMBEDDING_DIMENSIONS = 384


@lru_cache()
def clients():
    if not settings.pinecone_api_key:
        raise ValueError("PINECONE_API_KEY must be set in the environment.")
    return Pinecone(api_key=settings.pinecone_api_key)


@lru_cache()
def embedding_model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(EMBEDDING_MODEL)


def ensure_index():
    pc = clients()
    if not pc.has_index(settings.pinecone_index):
        pc.create_index(name=settings.pinecone_index, dimension=EMBEDDING_DIMENSIONS, metric='cosine', spec=ServerlessSpec(cloud='aws', region='us-east-1'))
    description = pc.describe_index(settings.pinecone_index)
    if description.dimension != EMBEDDING_DIMENSIONS:
        raise ValueError(
            f"Pinecone index '{settings.pinecone_index}' has dimension "
            f"{description.dimension}; {EMBEDDING_DIMENSIONS} is required. "
            "Set PINECONE_INDEX to a new index name."
        )
    return pc.Index(settings.pinecone_index)


def embed(texts):
    vectors = embedding_model().encode(texts, normalize_embeddings=True)
    return vectors.tolist()



def search_kb(query, top_k=5):
    index = ensure_index()
    vector = embed([query])[0]
    result = index.query(vector=vector, top_k=top_k, include_metadata=True)
    return [{'page': m.metadata.get('page'), 'text': m.metadata.get('text',''), 'score': round(m.score,3), 'source': 'Gale Encyclopedia (2002)'} for m in result.matches if m.score >= 0.30]
