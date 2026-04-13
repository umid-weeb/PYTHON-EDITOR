import logging
import asyncio
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.models.user import User
from app.models.rating import UserRating
from app.models.submission import UserStats
from app.services.notification_service import notification_service

logger = logging.getLogger("marketing")

class MarketingService:
    @staticmethod
    def _get_gold_template(name: str, rating: int, solved: int) -> str:
        return f"""
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0f172a; color: #f8fafc; border: 4px solid #facc15; border-radius: 24px;">
            <div style="text-align: center; margin-bottom: 25px;">
                <h1 style="color: #facc15; margin: 0; font-size: 32px;">🏆 Arena Qiroli</h1>
                <p style="color: #94a3b8; font-style: italic;">PyZone Arena Mutloq Yetakchisi</p>
            </div>
            <div style="background: rgba(250,204,21,0.1); padding: 25px; border-radius: 16px; margin-bottom: 25px; border: 1px solid rgba(250,204,21,0.3);">
                <h2 style="color: #facc15;">Salom, {name}! 👑</h2>
                <p style="font-size: 18px; line-height: 1.6;">Siz haqiqiy afsonasiz! Hozirda <b>{rating}</b> reyting bilan platformada <b>1-o'rinni</b> egallab turibsiz.</p>
                <p>Siz {solved} ta masalani muvaffaqiyatli yechgansiz. O'z o'rningizni asrang!</p>
            </div>
            <div style="text-align: center;">
                <a href="https://pyzone.uz/zone/problems" style="display: inline-block; background: #facc15; color: #0f172a; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 18px;">Arena-ga qaytish</a>
            </div>
        </div>
        """

    @staticmethod
    def _get_silver_template(name: str, rating: int, solved: int, rank: int, next_rank_user: str = "") -> str:
        competitor_text = f"Siz hozirda <b>{rank}-o'rindasiz</b>. Ozgina harakat qilsangiz {rank-1}-o'ringa chiqishingiz mumkin."
        if rank == 2 and next_rank_user:
            competitor_text = f"Siz <b>2-o'rindasiz</b>, ozgina harakat qilsangiz <b>{next_rank_user}</b>dan o'tasiz va 1-o'ringa chiqasiz! 🔥"
        elif next_rank_user:
             competitor_text = f"Siz hozirda <b>{rank}-o'rindasiz</b>. Ozgina harakat qilsangiz <b>{next_rank_user}</b>dan o'tib {rank-1}-o'ringa ko'tarilasiz!"

        return f"""
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0f172a; color: #f8fafc; border: 2px solid #94a3b8; border-radius: 24px;">
            <div style="text-align: center; margin-bottom: 25px;">
                <h1 style="color: #cbd5e1; margin: 0; font-size: 28px;">🥈 Taxt juda yaqin!</h1>
                <p style="color: #94a3b8;">PyZone Arena Top 3 taligi</p>
            </div>
            <div style="background: rgba(148,163,184,0.1); padding: 25px; border-radius: 16px; margin-bottom: 25px;">
                <h2 style="color: #cbd5e1;">Salom, {name}! 🔥</h2>
                <p style="font-size: 17px; line-height: 1.6;">{competitor_text}</p>
                <p>Hozirgi reytingingiz: {rating}. Siz {solved} ta masala yechgansiz. Birgina g'alaba sizni Qirol darajasiga olib chiqishi mumkin.</p>
            </div>
            <div style="text-align: center;">
                <a href="https://pyzone.uz/zone/problems" style="display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 18px;">Arena-ni zabt etish</a>
            </div>
        </div>
        """

    @staticmethod
    def _get_bronze_template(name: str, rating: int, solved: int, rank: int, next_rank_user: str = "") -> str:
        competitor_text = f"Siz hozirda <b>{rank}-o'rindasiz</b>. Keyingi marragacha juda oz qoldi."
        if next_rank_user:
            competitor_text = f"Siz hozirda <b>{rank}-o'rindasiz</b>. Ozgina harakat qilsangiz <b>{next_rank_user}</b>dan o'tib {rank-1}-o'ringa chiqasiz! 🚀"

        return f"""
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0f172a; color: #f8fafc; border-radius: 24px; border: 1px solid #1e293b;">
            <div style="text-align: center; margin-bottom: 25px;">
                <h1 style="color: #10b981; margin: 0; font-size: 26px;">🚀 Yangi marralar sari!</h1>
            </div>
            <div style="background: rgba(16,185,129,0.05); padding: 25px; border-radius: 16px; margin-bottom: 25px;">
                <p style="font-size: 16px; line-height: 1.6;">Salom {name}! {competitor_text}</p>
                <p>Sizning reytingingiz <b>{rating}</b> va yechilgan masalalar soni <b>{solved}</b> ga yetdi. Top reytingga kirish va bilimingizni oshirish uchun yangi masalalar qo'shildi!</p>
            </div>
            <div style="text-align: center;">
                <a href="https://pyzone.uz/zone/problems" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: bold;">Arena-ni zabt etish</a>
            </div>
        </div>
        """

    async def send_daily_motivation(self, db: Session):
        """Fetch users by rating and send daily tiered motivation letters."""
        logger.info("🎬 Starting scheduled mass motivation task with corrected rank logic...")
        
        # Use UserStats for the authoritative rating and solved count
        query = (
            db.query(User, UserStats.rating, UserStats.solved_count)
            .join(UserStats, User.id == UserStats.user_id)
            .filter(User.email != None)
            .order_by(desc(UserStats.rating), desc(UserStats.solved_count))
        )
        
        results = query.all()
        logger.info(f"📊 Found {len(results)} users in UserStats leaderboard.")
        
        count = 0
        for i, (user, rating, solved) in enumerate(results):
            rank = i + 1
            name = user.display_name or user.username
            solved = solved or 0
            
            # Identify competitor (the user at rank - 1)
            next_user_name = ""
            if i > 0:
                prev_user, _, _ = results[i-1]
                next_user_name = prev_user.username # Use username as an identifier
            
            # Diagnostic Log BEFORE sending
            logger.info(f"Preparing Rank {rank}: {user.username} (Rating: {rating}, Solved: {solved}), Next target: {next_user_name}")
            
            subject = "✨ PyZone Arena: Sizni yangi marralar kutmoqda!"
            html_content = ""
            
            if rank == 1:
                subject = "🏆 PyZone Arena: Siz mutloq yetakchisiz!"
                html_content = self._get_gold_template(name, rating, solved)
            elif rank <= 3:
                subject = "🔥 PyZone Arena: Cho'qqi juda yaqin!"
                html_content = self._get_silver_template(name, rating, solved, rank, next_user_name)
            else:
                html_content = self._get_bronze_template(name, rating, solved, rank, next_user_name)
                
            try:
                # Send asynchronously
                sent = await notification_service.send_email_async(user.email, subject, html_content, is_html=True)
                if sent:
                    count += 1
                
                # Small delay to prevent SMTP throttling
                if i % 3 == 0:
                    await asyncio.sleep(0.5)
            except Exception as e:
                logger.error(f"Failed to send to {user.email}: {e}")

        logger.info(f"✅ Mass mailing completed. Successfully sent to {count} users.")
        return count

marketing_service = MarketingService()

def get_marketing_service() -> MarketingService:
    return marketing_service
