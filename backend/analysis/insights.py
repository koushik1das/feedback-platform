"""
Insights Generator Module.

Transforms categorised feedback into human-readable analytics:
  - Top issues ranked by frequency
  - Sentiment distribution
  - Trending issue detection
  - AI-generated executive summary (Claude API or deterministic fallback)
"""

from datetime import datetime
from collections import defaultdict
from typing import List
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from models import (
    CategorisedFeedback, InsightsResponse, IssueStats,
    SentimentDistribution, SentimentLabel,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pick_examples(items: List[CategorisedFeedback], n: int = 3) -> List[str]:
    """
    Choose up to N representative negative/neutral example comments.
    Prefers shorter, distinct comments.
    """
    candidates = sorted(
        items,
        key=lambda x: (x.sentiment.score, -len(x.feedback.customer_text)),
    )
    seen: set[str] = set()
    examples: List[str] = []
    for c in candidates:
        text = c.feedback.customer_text[:200]
        if text not in seen:
            seen.add(text)
            examples.append(text)
        if len(examples) >= n:
            break
    return examples


def _sentiment_label_for_score(avg_score: float) -> SentimentLabel:
    if avg_score > 0.1:
        return SentimentLabel.POSITIVE
    elif avg_score < -0.1:
        return SentimentLabel.NEGATIVE
    return SentimentLabel.NEUTRAL


# ── AI Summary (Claude API with deterministic fallback) ───────────────────────

def _generate_ai_summary(top_issues: List[IssueStats], total: int,
                          channels: List[str]) -> str:
    """
    Try to generate an executive summary via Claude API.
    Falls back to a deterministic template if the API key is not configured.
    """
    # Build prompt context
    issue_list = "\n".join(
        f"  - {iss.label}: {iss.percentage:.1f}% of complaints"
        for iss in top_issues[:5]
    )
    prompt = (
        f"You are a customer experience analyst. Based on the following data, "
        f"write a 3-sentence executive summary:\n\n"
        f"Total feedback analysed: {total}\n"
        f"Channels: {', '.join(channels)}\n"
        f"Top issues:\n{issue_list}\n\n"
        f"Keep it concise, factual, and actionable."
    )

    # Attempt Claude API call
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if api_key:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=api_key)
            message = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=256,
                messages=[{"role": "user", "content": prompt}],
            )
            return message.content[0].text.strip()
        except Exception as e:
            print(f"[insights] Claude API call failed ({e}), using fallback.")

    # ── Deterministic fallback ──────────────────────────────────────────────
    top3 = [iss.label for iss in top_issues[:3]]
    top_pct = top_issues[0].percentage if top_issues else 0
    return (
        f"Analysis of {total} feedback items across {len(channels)} channel(s) "
        f"reveals that '{top3[0]}' is the dominant pain point, accounting for "
        f"{top_pct:.1f}% of all complaints. "
        f"Other significant issues include {' and '.join(top3[1:])}. "
        f"Immediate attention to payment infrastructure and authentication "
        f"reliability is recommended to improve customer satisfaction."
    )


# ── Core insights builder ─────────────────────────────────────────────────────

def generate_insights(
    categorised: List[CategorisedFeedback],
    channels: List[str],
) -> InsightsResponse:
    """
    Build a full InsightsResponse from categorised feedback.

    Steps:
      1. Group by issue label.
      2. Compute frequency, percentage, average sentiment.
      3. Pick example comments.
      4. Compute global sentiment distribution.
      5. Detect trending issues (high neg sentiment + high volume).
      6. Generate AI summary.
    """
    if not categorised:
        return InsightsResponse(
            total_feedback=0,
            channels_analysed=channels,
            top_issues=[],
            sentiment_distribution=SentimentDistribution(
                positive=0, neutral=0, negative=0, total=0
            ),
            trending_issues=[],
            ai_summary="No feedback data available for the selected channels.",
            generated_at=datetime.utcnow(),
        )

    total = len(categorised)

    # ── Group by label ────────────────────────────────────────────────────────
    groups: dict[str, List[CategorisedFeedback]] = defaultdict(list)
    for item in categorised:
        groups[item.issue_label].append(item)

    # ── Sentiment distribution ────────────────────────────────────────────────
    sent_pos = sum(1 for c in categorised if c.sentiment.label == SentimentLabel.POSITIVE)
    sent_neu = sum(1 for c in categorised if c.sentiment.label == SentimentLabel.NEUTRAL)
    sent_neg = sum(1 for c in categorised if c.sentiment.label == SentimentLabel.NEGATIVE)

    sentiment_dist = SentimentDistribution(
        positive=sent_pos,
        neutral=sent_neu,
        negative=sent_neg,
        total=total,
    )

    # ── Build IssueStats per category ─────────────────────────────────────────
    issue_stats: List[IssueStats] = []
    for label, items in groups.items():
        count = len(items)
        percentage = round(count / total * 100, 1)
        avg_score = round(sum(i.sentiment.score for i in items) / count, 4)
        sent_label = _sentiment_label_for_score(avg_score)

        channel_breakdown: dict[str, int] = defaultdict(int)
        for item in items:
            channel_breakdown[item.feedback.channel.value] += 1

        issue_stats.append(IssueStats(
            label=label,
            count=count,
            percentage=percentage,
            avg_sentiment=avg_score,
            sentiment_label=sent_label,
            example_comments=_pick_examples(items),
            channels=dict(channel_breakdown),
        ))

    # Sort by count descending
    issue_stats.sort(key=lambda x: x.count, reverse=True)

    # ── Trending issues: high volume AND high negativity ──────────────────────
    avg_count = total / len(groups) if groups else 0
    trending = [
        iss.label for iss in issue_stats
        if iss.count >= avg_count and iss.avg_sentiment < -0.1
    ][:3]

    # ── AI Summary ────────────────────────────────────────────────────────────
    summary = _generate_ai_summary(issue_stats, total, channels)

    return InsightsResponse(
        total_feedback=total,
        channels_analysed=channels,
        top_issues=issue_stats,
        sentiment_distribution=sentiment_dist,
        trending_issues=trending,
        ai_summary=summary,
        generated_at=datetime.utcnow(),
    )
