from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class PreferencesRequest(BaseModel):
    brokers: list[str] = Field(default_factory=list)
    sectors: list[str] = Field(default_factory=list)
    style: str | None = None
