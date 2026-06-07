from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator


BrokerOption = Literal[
    "Dhan",
    "Angel One",
    "Zerodha",
    "Groww",
    "Upstox",
    "Shoonya",
    "Other",
]


class WaitlistRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    broker: BrokerOption
    early_access: bool = False
    source: str = Field(..., min_length=1, max_length=100)

    @field_validator("name", "source", mode="before")
    @classmethod
    def strip_text_fields(cls, value: str) -> str:
        return value.strip()


class WaitlistResponse(BaseModel):
    success: bool = True
    id: int
    email: EmailStr
    broker: BrokerOption
    early_access: bool
    created_at: datetime

    model_config = {"from_attributes": True}
