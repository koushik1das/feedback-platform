"""
Mock data sources for all supported feedback channels.

In production, each fetch_* function would be replaced with a real
API integration (App Store Connect, Twitter API, Zendesk, etc.).
The function signatures and return types remain identical, making
the swap completely transparent to the rest of the system.
"""

import uuid
import logging
from datetime import datetime, timedelta
import random
from typing import List

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from models import FeedbackItem, ChannelType

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _random_ts(days_back: int = 30) -> datetime:
    """Return a random timestamp within the last N days."""
    offset = random.randint(0, days_back * 24 * 60)
    return datetime.utcnow() - timedelta(minutes=offset)


def _item(source: str, channel: ChannelType, text: str,
          rating: float | None = None, **meta) -> FeedbackItem:
    return FeedbackItem(
        id=str(uuid.uuid4()),
        source=source,
        channel=channel,
        timestamp=_random_ts(),
        customer_text=text,
        rating=rating,
        metadata=meta,
    )


# ── App Store iOS ─────────────────────────────────────────────────────────────

_IOS_REVIEWS = [
    # Payment issues (highest volume)
    ("Payment failed but money was deducted from my account. Very frustrating!", 1),
    ("Tried to pay three times, each time it says payment failed but I can see the deductions in my bank. Terrible!", 1),
    ("Payment keeps failing at checkout. I've lost Rs 2000 and still no order placed.", 1),
    ("The app charged me twice for the same order. Customer support is not responding.", 1),
    ("Money deducted, order not confirmed. This is fraud!", 1),
    ("UPI payment fails every single time. Works fine on other apps.", 2),
    ("Refund not received after 15 days. My payment failed but amount not returned.", 1),
    ("Payment gateway is broken. Can't complete any transaction.", 1),
    # Login / OTP
    ("OTP never arrives. Can't login at all. Please fix this!", 1),
    ("Login OTP takes 30 minutes to arrive by which time it expires. Useless.", 1),
    ("Can't login to my account. Forgot password reset OTP not coming.", 2),
    ("Keep getting logged out randomly. Have to re-login every time I open the app.", 2),
    ("Login works sometimes and fails other times. Very inconsistent.", 2),
    ("Account shows as suspended but I never violated any rules.", 1),
    ("New device login OTP not received even after 5 attempts.", 1),
    # App crashes
    ("App crashes every time I open my cart. Can't complete checkout.", 1),
    ("Crashes on startup after the latest update. Completely unusable now.", 1),
    ("App freezes when I scroll through the product listing.", 2),
    ("Constant crashes on iPhone 15. Never had this issue before the update.", 1),
    ("The app crashes when I try to upload a profile picture.", 2),
    ("App hangs for minutes on the loading screen then crashes.", 1),
    ("Crashes specifically during video streaming. Other features work fine.", 2),
    # Customer support
    ("Raised a ticket 10 days ago, no response yet. Pathetic support.", 1),
    ("Customer support chat bot is completely useless. Can't connect to a real agent.", 1),
    ("Called helpline 5 times, always on hold for 30 minutes then dropped.", 1),
    ("Support agents are rude and unhelpful. Resolved nothing.", 2),
    # Positive reviews (to balance the dataset)
    ("Love the app! Super fast delivery and easy to use.", 5),
    ("Great experience overall. The new update improved performance.", 5),
    ("Best shopping app. UI is clean and payments usually work fine.", 4),
    ("Excellent customer service. Resolved my issue in minutes.", 5),
    ("App is smooth and fast. Keep up the good work.", 4),
    # Delivery issues
    ("Order delivered to wrong address. App showed correct address but delivery went elsewhere.", 1),
    ("Package arrived damaged. No option to report it easily in the app.", 2),
    ("Estimated delivery was 2 days, it's been 10 days now.", 1),
    ("Wrong item delivered. Return process is a nightmare.", 1),
    # UI / UX
    ("The new UI is confusing. Can't find my order history anymore.", 2),
    ("Search results are irrelevant. Filters don't work properly.", 2),
    ("App is too slow. Takes 10 seconds to load a product page.", 2),
]

def fetch_app_store_ios() -> List[FeedbackItem]:
    """Simulate fetching reviews from Apple App Store Connect API."""
    return [_item("app_store_ios", ChannelType.APP_STORE, text, rating,
                  platform="iOS", version=random.choice(["4.2.1","4.3.0","4.3.1"]))
            for text, rating in _IOS_REVIEWS]


# ── Google Play Store ─────────────────────────────────────────────────────────

_PLAY_REVIEWS = [
    ("Payment failed but money got deducted. Raised complaint but no resolution.", 1),
    ("Can't login, OTP expired before I could enter it. Needs longer OTP validity.", 2),
    ("App crashed while I was in the middle of checkout. Lost my cart.", 1),
    ("The app is getting worse with every update. So many bugs.", 1),
    ("Money charged twice for one order. Support team kept saying they'll fix it.", 1),
    ("Login doesn't work on Android 14. Stuck on loading screen.", 1),
    ("App keeps crashing on Samsung Galaxy S23. Very disappointing.", 1),
    ("Delivery was on time but app crashed while tracking.", 3),
    ("Refund hasn't come back in 14 days. Payment failed order refund pending.", 1),
    ("Great app overall but the payment section needs serious fixing.", 3),
    ("OTP for login comes very late, by then it's already expired.", 1),
    ("App freezes when adding items to cart. Android 13 user.", 2),
    ("Customer support is non-existent. Robot replies only.", 1),
    ("Love the variety of products. Delivery is always fast.", 5),
    ("Wrong product delivered twice in a row. Very unhappy.", 1),
    ("App shows out of stock but item is available. Bug in inventory display.", 2),
    ("Payment UPI integration is broken. Only card payments work.", 2),
    ("Wish list feature is broken. Items disappear from wishlist.", 2),
    ("Notification spam is too much. No clear way to turn them off.", 2),
    ("Beautiful UI, great experience. One of the best shopping apps.", 5),
]

def fetch_google_play() -> List[FeedbackItem]:
    """Simulate fetching reviews from Google Play Developer API."""
    return [_item("google_play", ChannelType.APP_STORE, text, rating,
                  platform="Android", version=random.choice(["4.2.1","4.3.0","4.3.1"]))
            for text, rating in _PLAY_REVIEWS]


# ── Twitter / X ───────────────────────────────────────────────────────────────

_TWITTER_POSTS = [
    "@ShopEasy payment failed AGAIN and money deducted!! This is the 3rd time! #fraud #shopEasy",
    "@ShopEasy your OTP login is broken. Never receives SMS. Fix this asap!",
    "App crashed on me during checkout @ShopEasy losing my mind here",
    "@ShopEasy when will you fix the payment gateway?? I've complained 4 times!!",
    "Just had the worst experience with @ShopEasy support. Waited 45 mins on hold.",
    "@ShopEasy money deducted order cancelled this is unacceptable!!!",
    "The new @ShopEasy update broke everything. App crashes every 2 minutes.",
    "@ShopEasy where's my refund?? Payment failed 2 weeks ago still waiting",
    "Tried to login to @ShopEasy 10 times. OTP not working. Pathetic service.",
    "@ShopEasy your delivery partner left my package outside in the rain. Damaged!",
    "Can't believe @ShopEasy charged me twice!! This is daylight robbery",
    "@ShopEasy app keeps logging me out. Very annoying. Please fix",
    "Love @ShopEasy, just got my order super fast. Great service!",
    "@ShopEasy the new UI is confusing, can't find the cart icon",
    "@ShopEasy fix your payment system!!! It's been broken for weeks #frustrated",
    "Great deal on @ShopEasy today. App worked perfectly. Happy customer!",
    "@ShopEasy account got suspended without any reason. Support not helping.",
    "The @ShopEasy chatbot is absolutely useless. Just loops me in circles.",
    "@ShopEasy Wrong item delivered. Return process is too complicated.",
    "@ShopEasy why is the app so slow after the latest update?",
]

def fetch_twitter() -> List[FeedbackItem]:
    """Simulate fetching posts from Twitter/X API v2."""
    return [_item("twitter", ChannelType.SOCIAL_MEDIA, text,
                  likes=random.randint(0, 500),
                  retweets=random.randint(0, 100))
            for text in _TWITTER_POSTS]


# ── Facebook ──────────────────────────────────────────────────────────────────

_FACEBOOK_POSTS = [
    "I placed an order yesterday and the payment failed three times but my bank shows three charges. This is absolutely unacceptable. I want my money back immediately!",
    "Has anyone else had issues with the OTP for login? Mine never arrives and customer support keeps telling me to wait.",
    "The latest update completely broke the app for me. Crashes every time I try to open my orders. Running iOS 16.",
    "ShopEasy charged me twice and when I contacted support they said they can't see any duplicate charge. My bank statement clearly shows it. Very frustrated.",
    "Delivery was supposed to come 5 days ago. The tracking shows it's been at the local hub for 4 days. No one is helping.",
    "I love ShopEasy! Got my order delivered in 4 hours. Amazing service. The app is easy to use and payment was smooth.",
    "My account got banned for no reason. I've been a loyal customer for 3 years. Support is not responding to my emails.",
    "The new UI redesign is terrible. It was much easier to navigate before. Please bring back the old layout.",
    "Payment failure is a recurring issue. Happened to me 5 times this month. They need to fix their payment gateway.",
    "Can't login to my account. Reset password link not arriving in email. Have been locked out for 3 days now.",
    "App crashes when I try to upload photos for a product review. Annoying bug.",
    "Customer support chat is a joke. The bot doesn't understand anything and there's no option to speak to a human.",
    "Finally got my refund after 3 weeks of following up. The process should be much faster.",
    "The search feature is broken. Searching for 'blue shoes' shows me everything except blue shoes.",
    "Excellent service! Returned an item easily and got my refund in 2 days. Very impressed.",
]

def fetch_facebook() -> List[FeedbackItem]:
    """Simulate fetching posts/comments from Facebook Graph API."""
    return [_item("facebook", ChannelType.SOCIAL_MEDIA, text,
                  reactions=random.randint(0, 300),
                  comments=random.randint(0, 50))
            for text in _FACEBOOK_POSTS]


# ── Helpdesk Tickets ──────────────────────────────────────────────────────────

_HELPDESK_TICKETS = [
    {
        "subject": "Payment charged but order not confirmed",
        "text": "I attempted to place an order for Rs. 3,500 using UPI on 04-Mar-2026. The payment was deducted from my account (Ref: HDFC12345) but the order status shows 'Failed'. I have been waiting for a refund for 5 days. Please resolve urgently.",
        "priority": "high",
    },
    {
        "subject": "Unable to receive OTP for login",
        "text": "I am unable to login to my account as the OTP is not being delivered to my registered mobile number +91-9XXXXXXXX1. I have tried multiple times over the last 2 days. Please help.",
        "priority": "medium",
    },
    {
        "subject": "App crashing on iPhone - Critical",
        "text": "Since the latest app update (v4.3.0), the application crashes immediately upon opening on my iPhone 14 Pro (iOS 17.2). This is preventing me from accessing my account and pending orders.",
        "priority": "high",
    },
    {
        "subject": "Double charge on my credit card",
        "text": "My credit card was charged twice (Rs. 1,200 x2 = Rs. 2,400) for a single order #ORD-789012. I can see both transactions in my statement. Please initiate refund for the duplicate charge.",
        "priority": "critical",
    },
    {
        "subject": "Account suspended without notice",
        "text": "My account has been suspended without any prior notification or explanation. I am a premium subscriber and have been using the platform for 2 years. Please reinstate my account immediately.",
        "priority": "high",
    },
    {
        "subject": "Wrong item delivered",
        "text": "I ordered a Samsung Galaxy S24 (Black, 256GB) but received a Samsung Galaxy A14. The invoice in the package shows the correct item but the product is wrong. Please arrange a pickup and deliver the correct item.",
        "priority": "high",
    },
    {
        "subject": "Refund not received after 14 days",
        "text": "I cancelled order #ORD-456789 on 18-Feb-2026. The refund was promised within 7 business days but it has been 14 days and I have not received it. My ticket #TKT-11223 was closed without resolution.",
        "priority": "critical",
    },
    {
        "subject": "Login OTP expired before entry possible",
        "text": "The OTP validity window is too short. By the time the SMS arrives (1-2 minutes), the OTP has already expired. This is causing significant friction for login.",
        "priority": "medium",
    },
    {
        "subject": "Customer support chat unresponsive",
        "text": "I have been waiting in the support chat queue for over 45 minutes. The chatbot is unable to resolve my payment issue and I need to speak with a human agent urgently.",
        "priority": "medium",
    },
    {
        "subject": "Payment gateway error - UPI failure",
        "text": "All UPI payment attempts are failing with error code PAY_ERR_503. Net banking and card payments work fine. Please check UPI gateway configuration.",
        "priority": "high",
    },
    {
        "subject": "App not loading on Android 14",
        "text": "After upgrading to Android 14, the ShopEasy app gets stuck on the splash screen and never loads. Tried uninstalling and reinstalling twice. Device: OnePlus 11, Android 14.",
        "priority": "medium",
    },
    {
        "subject": "Delivery partner left package unattended",
        "text": "My package was left outside my door without ringing the bell. It was stolen by the time I came home. The delivery partner marked it as 'Delivered' without obtaining my signature.",
        "priority": "high",
    },
    {
        "subject": "Feedback: App performance improvement needed",
        "text": "The app has become noticeably slower in recent updates. Loading a product page takes 8-10 seconds on a good WiFi connection. Please optimize the performance.",
        "priority": "low",
    },
    {
        "subject": "Great service - Feedback",
        "text": "Just wanted to say the team handled my exchange request brilliantly. The whole process was smooth and the new item arrived the next day. Thank you!",
        "priority": "low",
    },
    {
        "subject": "Cannot apply coupon code at checkout",
        "text": "I have a valid coupon code SAVE20 but the app shows 'Invalid coupon' when I try to apply it. I verified the expiry date and it is valid until March 31, 2026.",
        "priority": "medium",
    },
]

def fetch_helpdesk() -> List[FeedbackItem]:
    """Simulate fetching tickets from Zendesk/Freshdesk REST API."""
    items = []
    for i, t in enumerate(_HELPDESK_TICKETS):
        items.append(_item(
            "helpdesk_zendesk", ChannelType.HELPDESK,
            t["text"],
            ticket_id=f"TKT-{10001+i}",
            subject=t["subject"],
            priority=t["priority"],
        ))
    return items


# ── Email Complaints ──────────────────────────────────────────────────────────

_EMAIL_COMPLAINTS = [
    "Subject: Urgent - Payment deducted order not placed\n\nDear Team, I am writing to report that my payment of Rs. 5,800 was deducted via net banking on 5th March 2026 but my order was never confirmed. Transaction ID: NEFT202603051234. Please resolve this at the earliest.",
    "Subject: OTP not received\n\nHello, I have been trying to log into my account for the past two hours. I am not receiving the OTP on my registered mobile number. I have checked with my telecom provider and there are no network issues. Please help.",
    "Subject: App crashes - Unable to use service\n\nTo Whom It May Concern, The ShopEasy mobile application has been crashing repeatedly since your update on 1st March. I am unable to access my account or complete any purchases. This is causing significant inconvenience.",
    "Subject: Complaint regarding double payment\n\nI am extremely unhappy to report that my account was debited twice for order #ORD-345678. I demand an immediate refund of the duplicate charge and a written explanation of how this occurred.",
    "Subject: Poor customer support experience\n\nI have been trying to resolve a payment issue for the past week. I have called your helpline 4 times and been disconnected each time. Your support chat gives only automated responses. This level of service is unacceptable.",
    "Subject: Account blocked without reason\n\nMy account has been blocked without any notice. I use your platform for my business and this is causing serious disruption. Please unblock my account immediately and explain the reason for this action.",
    "Subject: Delayed delivery - Order overdue by 8 days\n\nMy order #ORD-234567 placed on Feb 25 was promised for delivery by March 1. It is now March 7 and there is no update in the app. Please investigate and expedite delivery.",
    "Subject: Wrong product received\n\nI received a completely different product than what I ordered. The item I ordered was clearly described in my order confirmation but what arrived is a different brand and model entirely.",
    "Subject: Appreciation for excellent service\n\nI just wanted to write in to commend your delivery team and customer support. My recent experience was exceptional. The issue I raised was resolved quickly and professionally.",
    "Subject: Refund status enquiry\n\nI requested a refund for order #ORD-111222 on Feb 20, 2026. The refund reference is REF-98765. Could you please provide an update on when I can expect the funds to be credited?",
]

def fetch_email() -> List[FeedbackItem]:
    """Simulate fetching complaints from email / support inbox API."""
    items = []
    for i, text in enumerate(_EMAIL_COMPLAINTS):
        subject = text.split("\n")[0].replace("Subject: ", "")
        body = "\n".join(text.split("\n")[2:]).strip()
        items.append(_item(
            "email_support", ChannelType.EMAIL,
            body,
            email_id=f"EMAIL-{20001+i}",
            subject=subject,
        ))
    return items


# ── Chatbot Logs ──────────────────────────────────────────────────────────────

_CHATBOT_LOGS = [
    "User: my payment failed but money is gone from my account\nBot: I understand your concern about the payment. Can you share your order ID?\nUser: I don't have an order ID because the order failed\nBot: I'll escalate this to our billing team.\nUser: I've been told that 3 times already, nothing happens!",
    "User: otp not coming cant login\nBot: Please check if your mobile number is registered correctly.\nUser: yes it is registered i use this app daily\nBot: Try requesting OTP again after 30 seconds.\nUser: i've tried 10 times already this is useless",
    "User: app is crashing whenever i open it\nBot: Please try clearing the app cache and restarting.\nUser: did that already still crashing\nBot: Please reinstall the app.\nUser: reinstalled twice same issue your app is broken",
    "User: charged twice for one order\nBot: I'm sorry to hear that. Can I have your order ID?\nUser: ORD-99887\nBot: I can see the order. I'll raise a refund request.\nUser: i raised this 5 days ago and still no refund",
    "User: where is my delivery order number 556677\nBot: Your order is currently at the logistics hub.\nUser: it has been at the hub for 6 days\nBot: I'll escalate to the delivery team.\nUser: nobody ever calls me back when you escalate",
    "User: account got suspended\nBot: I can help with account issues. Can you share your registered email?\nUser: user@example.com\nBot: I can see your account. Let me check the suspension reason.\nUser: its been suspended for 4 days already this is ridiculous",
    "User: coupon code not working\nBot: Please share the coupon code.\nUser: SAVE20\nBot: The coupon appears to be valid. Please try again.\nUser: i've tried 20 times it never works in your app",
    "User: I want to return a wrong item\nBot: I can help with returns. What item did you receive?\nUser: I ordered Nike shoes but got Adidas\nBot: I'll initiate a return request for you.\nUser: Thank you that was quick and easy!",
    "User: payment gateway showing error\nBot: Which payment method were you using?\nUser: UPI\nBot: UPI payments are currently experiencing intermittent issues.\nUser: so your system is broken and you didn't tell anyone? disgusting",
    "User: how do i change my delivery address\nBot: Go to My Account > Addresses > Edit.\nUser: ok found it thank you\nBot: Happy to help! Is there anything else?",
]

def _mock_chatbot_logs() -> List[FeedbackItem]:
    """Return mock chatbot feedback (used when Superset is not configured)."""
    items = []
    for i, log in enumerate(_CHATBOT_LOGS):
        user_lines = [l.replace("User: ", "").strip()
                      for l in log.split("\n") if l.startswith("User: ")]
        combined = " | ".join(user_lines)
        items.append(_item(
            "chatbot_platform", ChannelType.CHATBOT,
            combined,
            session_id=f"CHAT-{30001+i}",
            turns=log.count("User:"),
        ))
    return items


def fetch_chatbot_logs() -> List[FeedbackItem]:
    """
    Fetch chatbot feedback.

    When SUPERSET_BASE_URL / SUPERSET_USERNAME / SUPERSET_PASSWORD /
    SUPERSET_CHATBOT_DATASET_ID are all set, pulls live data from the
    configured Apache Superset dataset.  Otherwise falls back to mock data
    so the platform works out-of-the-box without credentials.
    """
    from ingestion.superset_client import SupersetClient, superset_configured

    if not superset_configured():
        logger.debug("Superset not configured – using mock chatbot data.")
        return _mock_chatbot_logs()

    try:
        client = SupersetClient.from_env()
        rows = client.fetch_chatbot_feedback()
        items = []
        for row in rows:
            items.append(FeedbackItem(
                id=row["id"],
                source=row["source"],
                channel=ChannelType.CHATBOT,
                timestamp=row["timestamp"],
                customer_text=row["customer_text"],
                rating=row["rating"],
                metadata={
                    "session_id": row["session_id"],
                    "intent": row["intent"],
                },
            ))
        logger.info("Loaded %d chatbot items from Superset.", len(items))
        return items or _mock_chatbot_logs()   # fallback if dataset is empty
    except Exception as exc:
        logger.warning(
            "Superset fetch failed (%s) – falling back to mock chatbot data.", exc
        )
        return _mock_chatbot_logs()


# ── Channel registry ──────────────────────────────────────────────────────────

CHANNEL_FETCHERS = {
    ChannelType.APP_STORE:    lambda: fetch_app_store_ios() + fetch_google_play(),
    ChannelType.SOCIAL_MEDIA: lambda: fetch_twitter() + fetch_facebook(),
    ChannelType.HELPDESK:     fetch_helpdesk,
    ChannelType.EMAIL:        fetch_email,
    ChannelType.CHATBOT:      fetch_chatbot_logs,
}
