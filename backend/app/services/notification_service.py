import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

class NotificationService:
    """Service to handle Email and SMS notifications."""

    def __init__(self):
        self.eskiz_token: Optional[str] = None

    async def _get_eskiz_token(self) -> Optional[str]:
        """Authenticate with Eskiz.uz API and return token."""
        if not settings.eskiz_email or not settings.eskiz_password:
            return None
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://notify.eskiz.uz/api/auth/login",
                    data={
                        "email": settings.eskiz_email,
                        "password": settings.eskiz_password
                    }
                )
                if response.status_code == 200:
                    data = response.json()
                    return data.get("data", {}).get("token")
        except Exception as e:
            logger.error(f"Eskiz auth failed: {e}")
        return None

    async def send_sms(self, phone: str, message: str) -> bool:
        """Send SMS via Eskiz.uz."""
        if not settings.auto_notify_enabled or not phone:
            return False

        token = await self._get_eskiz_token()
        if not token:
            logger.warning("SMS not sent: No Eskiz token")
            return False

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://notify.eskiz.uz/api/message/sms/send",
                    headers={"Authorization": f"Bearer {token}"},
                    data={
                        "mobile_phone": phone.replace("+", "").replace(" ", ""),
                        "message": message,
                        "from": "4546"  # Default Eskiz sender ID
                    }
                )
                return response.status_code == 200
        except Exception as e:
            logger.error(f"SMS sending failed: {e}")
            return False

    def send_email(self, recipient: str, subject: str, body: str, is_html: bool = False) -> bool:
        """Send Email via SMTP."""
        if not settings.auto_notify_enabled or not recipient or not settings.smtp_password:
            return False

        try:
            msg = MIMEMultipart()
            # Gmail SMTP requires From to match the logged-in user or a verified alias
            msg["From"] = settings.smtp_user
            msg["To"] = recipient
            msg["Subject"] = subject

            msg.attach(MIMEText(body, "html" if is_html else "plain"))

            with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
                server.starttls()
                server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
            return True
        except Exception as e:
            logger.error(f"Email sending failed: {e}")
            return False

    async def notify_user(self, user, message: str, subject: str = "PyZone Arena Motivatsiya"):
        """Send notification via available channels (respecting fallback priorities)."""
        success = False
        
        # Priority 1: Email (Universal)
        if user.email:
            # We wrap the text in a simple HTML template for better premium feel
            html_body = f"""
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
                <h2 style="color: #10b981;">PyZone Arena</h2>
                <p style="font-size: 16px; color: #333; line-height: 1.6;">{message}</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #999;">Agar bildirishnomalarni o'chirmoqchi bo'lsangiz, profilingizga kiring.</p>
            </div>
            """
            success = self.send_email(user.email, subject, html_body, is_html=True) or success

        # Priority 2: SMS (If phone exists)
        if user.phone_number:
            # Limit SMS to 160 chars if possible
            sms_text = message[:157] + "..." if len(message) > 160 else message
            success = await self.send_sms(user.phone_number, sms_text) or success
            
        return success

notification_service = NotificationService()
