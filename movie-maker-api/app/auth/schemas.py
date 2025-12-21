from pydantic import BaseModel, EmailStr
from datetime import datetime


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    display_name: str | None = None
    plan_type: str = "free"
    video_count_this_month: int = 0
    created_at: datetime

    class Config:
        from_attributes = True
