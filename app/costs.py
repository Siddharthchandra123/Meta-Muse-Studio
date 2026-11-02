"""List-price estimates; not an enforced spending cap or provider invoice."""

from app.schemas import UsageEstimate
from app.provider import ModelReply

# USD per million tokens, Standard mode (Meta docs checked 2026-10-28)
STANDARD_RATES = {
    "muse-spark-1.3": (1.25, 0.15, 4.25),
    "muse-spark-1.2": (1.25, 0.15, 4.25),
    "muse-spark-1.1": (1.25, 0.15, 4.25),
    "muse-wonder-1.0": (4.00, 0.20, 20.00),
}


def usage_from_reply(reply: ModelReply) -> UsageEstimate:
    input_count = reply.input_tokens
    output_count = reply.output_tokens
    cached_count = reply.cached_input_tokens or 0
    usd = None
    if (
        reply.model in STANDARD_RATES
        and input_count is not None
        and output_count is not None
    ):
        input_rate, cached_rate, output_rate = STANDARD_RATES[reply.model]
        cached_count = min(max(0, cached_count), input_count)
        usd = round(
            ((input_count - cached_count) * input_rate
             + cached_count * cached_rate
             + output_count * output_rate) / 1_000_000,
            8,
        )
    return UsageEstimate(
        input_tokens=input_count,
        output_tokens=output_count,
        cached_input_tokens=reply.cached_input_tokens,
        estimated_cost_usd=usd,
    )
