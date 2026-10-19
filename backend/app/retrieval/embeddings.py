import asyncio
import hashlib
import math
from functools import cached_property
from typing import Protocol

import openai
from fastembed import TextEmbedding


class Embedder(Protocol):
    dim: int

    async def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    async def embed_query(self, text: str) -> list[float]: ...


class FastEmbedder:
    """Local ONNX model: free, no key, CPU-only. bge models use separate query/passage forms."""

    def __init__(self, model: str, dim: int, cache_dir: str | None = None) -> None:
        self.dim = dim
        self._model_name = model
        self._cache_dir = cache_dir

    @cached_property
    def _model(self) -> TextEmbedding:
        return TextEmbedding(self._model_name, cache_dir=self._cache_dir)

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        vectors = await asyncio.to_thread(lambda: list(self._model.passage_embed(texts)))
        return [v.tolist() for v in vectors]

    async def embed_query(self, text: str) -> list[float]:
        vectors = await asyncio.to_thread(lambda: list(self._model.query_embed(text)))
        return [float(x) for x in vectors[0]]


class OpenAICompatEmbedder:
    def __init__(self, model: str, dim: int, base_url: str | None, api_key: str | None) -> None:
        self.dim = dim
        self._model = model
        self._client = openai.AsyncOpenAI(base_url=base_url, api_key=api_key)

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        resp = await self._client.embeddings.create(model=self._model, input=texts)
        return [d.embedding for d in resp.data]

    async def embed_query(self, text: str) -> list[float]:
        return (await self.embed_documents([text]))[0]


class FakeEmbedder:
    """Deterministic bag-of-words hashing so tests get stable, roughly semantic neighbours."""

    def __init__(self, dim: int) -> None:
        self.dim = dim

    def _vec(self, text: str) -> list[float]:
        v = [0.0] * self.dim
        for word in text.lower().replace("_", " ").replace(".", " ").split():
            h = int.from_bytes(hashlib.sha256(word.encode()).digest()[:4], "big")
            v[h % self.dim] += 1.0
        norm = math.sqrt(sum(x * x for x in v)) or 1.0
        return [x / norm for x in v]

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]

    async def embed_query(self, text: str) -> list[float]:
        return self._vec(text)
