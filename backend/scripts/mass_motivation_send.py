import asyncio
import logging
import os
import sys

# Ensure the app module can be found
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal
from app.models.user import User
from app.models.submission import UserStats
from app.services.notification_service import notification_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mass_mailing")

async def send_mass_motivation():
    db = SessionLocal()
    users = db.query(User).filter(User.email != None).all()
    
    logger.info(f"🚀 Starting mass mailing for {len(users)} users...")
    
    count = 0
    for user in users:
        # Fetch stats
        stats = db.query(UserStats).filter(UserStats.user_id == user.id).first()
        solved = stats.solved_count if stats else 0
        rating = stats.rating if stats else 1200
        
        name = user.display_name or user.username
        
        # Psychological & Motivational Message (Uzbek)
        subject = f"🔥 {name}, PyZone Arena: Sizni yangi marralar kutmoqda!"
        
        message = f"""
        Salom {name}! 👋
        
        Sizning PyZone Arena-dagi natijalaringizni tahlil qildik:
        ✅ **Yechilgan masalalar**: {solved} ta
        📈 **Joriy reyting**: {rating}
        
        Lekin bu hali hammasi emas! 🧠 
        Platformamizda siz uchun maxsus yangi murakkab (Hard) algoritmlar va sovg'ali tanlovlar tayyorlab qo'yilgan. Birgina to'g'ri yechim sizni **TOP reytingga** olib chiqishi mumkin! 🚀
        
        Sizning kodingizni va algoritmlaringizni sog'indik. Qayting va o'z o'rningizni ko'rsatib qo'ying! 🐍💻
        
        Kirish: [www.pyzone.uz](https://www.pyzone.uz)
        """
        
        # Using a slightly refined HTML template for the mass mail
        html_body = f"""
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0f172a; color: #f8fafc; border-radius: 24px;">
            <div style="text-align: center; margin-bottom: 25px;">
                <h1 style="color: #10b981; margin: 0; font-size: 28px;">PyZone Arena</h1>
                <p style="color: #94a3b8; font-style: italic;">"Kod yozish — bu san'at"</p>
            </div>
            
            <div style="background: rgba(255,255,255,0.05); padding: 20px; border-radius: 16px; border: 1px solid #1e293b; margin-bottom: 25px;">
                <h2 style="margin-top: 0; font-size: 20px;">Salom, {name}! 👋</h2>
                <p style="font-size: 16px; line-height: 1.6; color: #cbd5e1;">Biz sizning natijalaringizni ko'rdik va tan berdik:</p>
                
                <table style="width: 100%; margin: 15px 0;">
                    <tr>
                        <td style="padding: 10px; background: #1e293b; border-radius: 8px; text-align: center;">
                            <div style="font-size: 12px; color: #94a3b8; text-transform: uppercase;">Yechilgan</div>
                            <div style="font-size: 24px; font-weight: bold; color: #10b981;">{solved}</div>
                        </td>
                        <td style="width: 15px;"></td>
                        <td style="padding: 10px; background: #1e293b; border-radius: 8px; text-align: center;">
                            <div style="font-size: 12px; color: #94a3b8; text-transform: uppercase;">Reyting</div>
                            <div style="font-size: 24px; font-weight: bold; color: #3b82f6;">{rating}</div>
                        </td>
                    </tr>
                </table>
                
                <p style="font-size: 16px; line-height: 1.6; color: #cbd5e1;">
                    Lekin algoritmlar olami to'xtab qolgani yo'q! 🧠 Yangi **Hard** darajadagi masalalar sizning logikangizni kutmoqda. 
                    Birgina qadam va siz TOP-10 talikdasiz! O'z salohiyatingizni dunyoga ko'rsatish vaqti kelmadimikan? 🚀
                </p>
            </div>
            
            <div style="text-align: center;">
                <a href="https://www.pyzone.uz" style="display: inline-block; background: #10b981; color: white; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 18px;">Arena-ga qaytish</a>
            </div>
            
            <p style="text-align: center; font-size: 12px; color: #64748b; margin-top: 30px;">
                Ushbu xat sizga PyZone Arena AI agenti tomonidan yuborildi. <br>
                Profilingizda bildirishnomalarni boshqarishingiz mumkin.
            </p>
        </div>
        """
        
        try:
            sent = notification_service.send_email(user.email, subject, html_body, is_html=True)
            if sent:
                count += 1
                logger.info(f"✅ Sent to {user.email}")
            else:
                logger.warning(f"❌ Failed to reach {user.email}")
        except Exception as e:
            logger.error(f"Error sending to {user.email}: {e}")
            
        # Small delay to prevent SMTP throttling even if count is low
        await asyncio.sleep(0.5)

    db.close()
    logger.info(f"🎉 Completed! Total successful emails: {count}")

if __name__ == "__main__":
    asyncio.run(send_mass_motivation())
