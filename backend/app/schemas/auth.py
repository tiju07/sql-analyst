import uuid
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.models import Role


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str
    role: Role
    allowed_states: list[str] | None
    is_demo: bool


class PersonaOut(BaseModel):
    key: Literal["admin", "analyst", "regional"]
    display_name: str
    role: Role
    allowed_states: list[str] | None
    blurb: str
