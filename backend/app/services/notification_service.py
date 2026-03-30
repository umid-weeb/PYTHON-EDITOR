import asyncio
import base64
import logging
import smtplib
import ssl
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

    @staticmethod
    def _has_gmail_api_credentials() -> bool:
        return bool(
            settings.gmail_client_id
            and settings.gmail_client_secret
            and settings.gmail_refresh_token
            and (settings.gmail_sender or settings.smtp_from or settings.smtp_user)
        )

    @staticmethod
    def _build_email_message(recipient: str, subject: str, body: str, *, is_html: bool = False) -> MIMEMultipart:
        from_address = settings.gmail_sender or settings.smtp_from or settings.smtp_user
        msg = MIMEMultipart()
        msg["From"] = from_address
        msg["To"] = recipient
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "html" if is_html else "plain", "utf-8"))
        return msg

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

    def get_email_provider(self) -> str:
        configured_provider = (settings.email_provider or "auto").strip().lower()
        if configured_provider and configured_provider != "auto":
            return configured_provider
        if self._has_gmail_api_credentials():
            return "gmail_api"
        if settings.resend_api_key:
            return "resend"
        if settings.smtp_host and settings.smtp_user and settings.smtp_password:
            return "smtp"
        return "none"

    def _send_email_via_gmail_api(self, recipient: str, subject: str, body: str, is_html: bool = False) -> bool:
        """Send email via Gmail API using OAuth refresh token over HTTPS."""
        if not self._has_gmail_api_credentials():
            logger.warning("Gmail API email not sent: OAuth credentials are missing")
            return False

        sender = settings.gmail_sender or settings.smtp_from or settings.smtp_user
        if not sender:
            logger.warning("Gmail API email not sent: sender address is missing")
            return False

        message = self._build_email_message(recipient, subject, body, is_html=is_html)
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")

        try:
            with httpx.Client(timeout=settings.email_timeout_seconds) as client:
                token_response = client.post(
                    settings.gmail_token_url,
                    data={
                        "client_id": settings.gmail_client_id,
                        "client_secret": settings.gmail_client_secret,
                        "refresh_token": settings.gmail_refresh_token,
                        "grant_type": "refresh_token",
                    },
                )
                if token_response.status_code != 200:
                    logger.error(
                        "Gmail API token exchange failed with status %s: %s",
                        token_response.status_code,
                        token_response.text[:500],
                    )
                    return False

                access_token = token_response.json().get("access_token")
                if not access_token:
                    logger.error("Gmail API token exchange did not return an access token")
                    return False

                response = client.post(
                    f"{settings.gmail_api_base_url.rstrip('/')}/gmail/v1/users/me/messages/send",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json",
                    },
                    json={"raw": raw_message},
                )

            if response.status_code in {200, 202}:
                return True
            logger.error(
                "Gmail API email sending failed with status %s: %s",
                response.status_code,
                response.text[:500],
            )
        except Exception as exc:
            logger.error("Gmail API email sending failed: %s", exc)
        return False

    def _send_email_via_resend(self, recipient: str, subject: str, body: str, is_html: bool = False) -> bool:
        """Send Email via Resend HTTP API over port 443."""
        if not settings.resend_api_key:
            logger.warning("Resend email not sent: API key is missing")
            return False

        from_address = settings.smtp_from or settings.smtp_user
        if not from_address:
            logger.warning("Resend email not sent: sender address is missing")
            return False

        payload = {
            "from": from_address,
            "to": [recipient],
            "subject": subject,
        }
        if is_html:
            payload["html"] = body
        else:
            payload["text"] = body

        endpoint = f"{settings.resend_api_base_url.rstrip('/')}/emails"

        try:
            with httpx.Client(timeout=settings.email_timeout_seconds) as client:
                response = client.post(
                    endpoint,
                    headers={
                        "Authorization": f"Bearer {settings.resend_api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
            if response.status_code in {200, 201, 202}:
                return True
            logger.error(
                "Resend email sending failed with status %s: %s",
                response.status_code,
                response.text[:500],
            )
        except Exception as exc:
            logger.error("Resend email sending failed: %s", exc)
        return False

    def _send_email_via_smtp(self, recipient: str, subject: str, body: str, is_html: bool = False) -> bool:
        """Send Email via SMTP."""
        if not settings.smtp_password or not settings.smtp_user:
            logger.warning("SMTP email not sent: SMTP credentials are missing")
            return False

        try:
            msg = self._build_email_message(recipient, subject, body, is_html=is_html)

            if settings.smtp_port == 465:
                server_class = smtplib.SMTP_SSL
            else:
                server_class = smtplib.SMTP

            with server_class(settings.smtp_host, settings.smtp_port, timeout=settings.email_timeout_seconds) as server:
                if settings.smtp_port != 465:
                    tls_context = ssl.create_default_context()
                    server.ehlo()
                    server.starttls(context=tls_context)
                    server.ehlo()
                server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
            return True
        except Exception as exc:
            logger.error(
                "SMTP email sending failed via %s:%s: %s",
                settings.smtp_host,
                settings.smtp_port,
                exc,
            )
            return False

    def send_email(self, recipient: str, subject: str, body: str, is_html: bool = False) -> bool:
        """Send Email via the configured provider."""
        if not settings.auto_notify_enabled or not recipient:
            return False

        provider = self.get_email_provider()
        if provider == "gmail_api":
            return self._send_email_via_gmail_api(recipient, subject, body, is_html=is_html)
        if provider == "resend":
            return self._send_email_via_resend(recipient, subject, body, is_html=is_html)
        if provider == "smtp":
            return self._send_email_via_smtp(recipient, subject, body, is_html=is_html)

        logger.warning("Email not sent: no supported provider is configured")
        return False

    async def send_email_async(self, recipient: str, subject: str, body: str, is_html: bool = False) -> bool:
        """Send Email in a thread pool to avoid blocking async code."""
        if not settings.auto_notify_enabled or not recipient:
            return False

        loop = asyncio.get_running_loop()
        try:
            return await loop.run_in_executor(
                None,
                self.send_email,
                recipient,
                subject,
                body,
                is_html
            )
        except Exception as e:
            logger.error(f"Async email sending failed: {e}")
            return False

    async def notify_user(self, user, message: str, subject: str = "PyZone Arena Motivatsiya"):
        """Send notification via available channels (respecting fallback priorities)."""
        success = False
        
        # Priority 1: Email (Universal) - use async version to avoid blocking
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
            success = await self.send_email_async(user.email, subject, html_body, is_html=True) or success

        # Priority 2: SMS (If phone exists)
        if user.phone_number:
            # Limit SMS to 160 chars if possible
            sms_text = message[:157] + "..." if len(message) > 160 else message
            success = await self.send_sms(user.phone_number, sms_text) or success
            
        return success

notification_service = NotificationService()
