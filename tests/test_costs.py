from app.costs import usage_from_reply
from app.provider import ModelReply


def test_cost_calculation_with_cache():
    reply = ModelReply(
        answer="OK", model="muse-spark-1.3", response_id="r",
        input_tokens=1_000_000, output_tokens=1_000_000,
        cached_input_tokens=500_000,
    )
    estimate = usage_from_reply(reply)
    assert estimate.estimated_cost_usd == 4.95


def test_unknown_model_does_not_invent_prices():
    reply = ModelReply(
        answer="OK", model="local-glimmer", response_id=None,
        input_tokens=100, output_tokens=20,
    )
    assert usage_from_reply(reply).estimated_cost_usd is None
