from uuid import UUID

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: UUID | None = None


class UsageEstimate(BaseModel):
    input_tokens: int | None
    output_tokens: int | None
    cached_input_tokens: int | None
    estimated_cost_usd: float | None


class UsageSummary(BaseModel):
    completed_calls: int
    estimated_total_usd: float
    calls_without_pricing: int
    disclaimer: str


class ChatResponse(BaseModel):
    conversation_id: UUID
    answer: str
    model: str
    provider_response_id: str | None
    usage: UsageEstimate
