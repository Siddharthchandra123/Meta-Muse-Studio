# Budget and performance plan

Baseline (2026-10-29): User reported **$150 Meta Muse API promotional credits**. Verify eligible services, expiry, actual balance and any per-model restrictions in the provider dashboard. The numbers below are proposed allocation and public list-rate *estimates*, not a spend guarantee.

## Planned allocation
| Pool | Proposed amount |
|---|---:|
| Muse Spark 1.3 primary inference | $70 |
| Muse Voice Transcribe | $20 |
| Search grounding | $15 |
| Muse Wonder escalation | $15 |
| Uncommitted reserve / validation | $30 |
| **Total** | **$150** |

## Meta Model API Standard mode published list prices (as checked 2026-10-29)
| Service | Rate |
|---|---|
| Spark 1.3 input tokens | $1.25 / 1M |
| Spark 1.3 cached input | $0.15 / 1M |
| Spark 1.3 output tokens | $4.25 / 1M |
| Wonder input | $4.00 / 1M |
| Wonder output | $20.00 / 1M |
| Built-in web grounding | $2.50 / 1K queries, plus token costs |
| Muse Voice Transcribe | $0.18 / audio hour |

## Calculation
```
estimated_chat_usd = (input_tokens - cached_tokens)*1.25/1e6 + cached_tokens*0.15/1e6 + output_tokens*4.25/1e6
```
These rates assume Standard Spark 1.3; *reasoning tokens count in output tokens*. Image, multimodal and other costs require checking current provider pricing before launch. Phase 1.1 defaults to `MUSE_REASONING_EFFORT=low` for small text-chat tasks. Reasoning tokens count as output tokens. The backend estimates cost for completed requests and exposes `/v1/usage` totals in RAM; it does **not** enforce a global hard spending cap. Failed or disconnected streamed calls may still incur Meta charges without being included in the estimate. Don't rely on this estimate as a safeguard against billable usage.

## Proposed controls (not yet implemented)
- Provider dashboard alerts and project limits, plus app-side daily budget gate.
- Token and tool iteration ceilings, prompt caching, conversation summaries.
- Wonder use requires an explicit rule/approval; do not route routine turns to it.
- Per-user/token budgets and a dashboard with upstream reconciliation.

## Benchmark plan
Measure with 30 fixed prompts per modality, repeated at least 3 times after warmup; keep raw CSV/JSON for every run. Collect:
- TTFT (time to first token), total response time, output tok/s, usage cost.
- Voice latency: speech end -> final transcript -> first model text -> first audible audio.
- Barge-in interruption time; ASR WER on consented reference set.
- Task completion accuracy; confirmation/authorization violation rate.
- CPU/GPU RAM, GPU VRAM, utilization, stability, energy if supported.
- Compare Spark API, local Glimmer on laptop and Glimmer on MI300X only under explicitly stated hardware and context conditions.

**No latency or throughput results have been measured yet.** Targets in the PRD are goals, not performance claims.
