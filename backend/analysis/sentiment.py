"""
Sentiment Analysis Module.

Uses a lexicon-based keyword approach for zero-dependency fast analysis.
The scoring is calibrated on customer-complaint vocabulary.
In production, swap _score() for a fine-tuned transformer model.
"""

import re
from typing import List
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from models import FeedbackItem, SentimentResult, SentimentLabel


# ── Lexicons ──────────────────────────────────────────────────────────────────

POSITIVE_WORDS = {
    "great", "excellent", "amazing", "love", "fantastic", "wonderful",
    "perfect", "awesome", "good", "best", "thank", "thanks", "happy",
    "pleased", "satisfied", "impressed", "smooth", "fast", "quick",
    "helpful", "resolved", "appreciate", "beautiful", "easy", "nice",
    "superb", "outstanding", "brilliant", "efficient", "reliable",
}

NEGATIVE_WORDS = {
    "failed", "failure", "broken", "crash", "crashes", "crashing",
    "error", "issue", "problem", "bug", "worst", "terrible", "awful",
    "horrible", "disgusting", "pathetic", "useless", "ridiculous",
    "unacceptable", "frustrated", "angry", "disappointed", "annoyed",
    "deducted", "charged", "stolen", "fraud", "scam", "ridiculous",
    "never", "not", "can't", "cannot", "won't", "doesn't", "doesn't",
    "slow", "lag", "hang", "freeze", "stuck", "blocked", "suspended",
    "wrong", "incorrect", "missing", "lost", "damaged", "delayed",
    "waiting", "waited", "ignored", "unresponsive", "useless", "joke",
    "robbery", "daylight", "escalated", "urgently", "urgent", "complain",
}

INTENSIFIERS = {
    "very", "extremely", "absolutely", "completely", "totally",
    "so", "really", "quite", "utterly", "deeply",
}

NEGATION_WORDS = {"not", "never", "no", "neither", "nor", "nothing"}


def _score(text: str) -> float:
    """
    Compute a sentiment score in [-1, +1].
    Positive values indicate positive sentiment.
    """
    text_lower = text.lower()
    tokens = re.findall(r"\b\w+\b", text_lower)

    pos_count = 0
    neg_count = 0
    intensifier_active = False

    for i, token in enumerate(tokens):
        # Check for intensifier preceding current word
        intensifier_active = (i > 0 and tokens[i - 1] in INTENSIFIERS)
        multiplier = 1.5 if intensifier_active else 1.0

        # Flip sentiment if preceded by negation (within 3 tokens)
        negated = any(tokens[max(0, i-3):i][j] in NEGATION_WORDS
                      for j in range(min(3, i)))

        if token in POSITIVE_WORDS:
            if negated:
                neg_count += multiplier
            else:
                pos_count += multiplier

        elif token in NEGATIVE_WORDS:
            if negated:
                pos_count += multiplier * 0.5
            else:
                neg_count += multiplier

    total = pos_count + neg_count
    if total == 0:
        return 0.0

    score = (pos_count - neg_count) / total
    return round(max(-1.0, min(1.0, score)), 4)


def analyse_sentiment(text: str) -> SentimentResult:
    """
    Return a SentimentResult for the given text.

    Thresholds:
        score >  0.1  → positive
        score < -0.1  → negative
        else          → neutral
    """
    score = _score(text)
    if score > 0.1:
        label = SentimentLabel.POSITIVE
    elif score < -0.1:
        label = SentimentLabel.NEGATIVE
    else:
        label = SentimentLabel.NEUTRAL
    return SentimentResult(label=label, score=score)


def analyse_batch(items: List[FeedbackItem]) -> List[SentimentResult]:
    """Analyse sentiment for a list of FeedbackItems."""
    return [analyse_sentiment(item.customer_text) for item in items]
