"""Request/response models (Pydantic) for the API."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator


class Preferences(BaseModel):
    budget_min: float = Field(0, ge=0, description="Minimum budget in ₹ lakh")
    budget_max: float = Field(..., gt=0, description="Maximum budget in ₹ lakh")
    body_types: list[str] = Field(default_factory=list)
    fuels: list[str] = Field(default_factory=list)
    fuel_strict: bool = Field(False, description="Exclude other fuel types entirely")
    transmission: Literal["manual", "automatic", "any"] = "any"
    transmission_strict: bool = False
    must_have_features: list[str] = Field(default_factory=list)
    priorities: list[Literal["safety", "performance", "space", "efficiency"]] = Field(default_factory=list)
    min_seats: Optional[int] = Field(None, ge=2, le=9)

    @model_validator(mode="after")
    def check_budget(self):
        if self.budget_min > self.budget_max:
            raise ValueError("budget_min must be <= budget_max")
        return self


class RecommendRequest(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    preferences: Preferences
    k: int = Field(10, ge=1, le=30)


class Recommendation(BaseModel):
    rank: int
    vehicle: dict
    score: float
    match_pct: int
    reasons: list[str]
    warnings: list[str]
    breakdown: dict[str, float]


class RecommendResponse(BaseModel):
    recommendation_id: str
    user_id: str
    used_implicit_profile: bool
    alpha: float
    candidates_after_filters: int
    results: list[Recommendation]


class EventIn(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    vehicle_id: Optional[int] = None
    event_type: str
    recommendation_id: Optional[str] = None
    position: Optional[int] = None
    value: Optional[float] = Field(None, description="e.g. feedback: 1 = thumbs up, 0 = thumbs down")


class TestDriveBookingIn(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    vehicle_id: int
    name: str = Field(..., min_length=1, max_length=100)
    phone: str = Field(..., min_length=7, max_length=20)
    city: str = Field(..., min_length=1, max_length=100)
    branch: str = Field("", max_length=100)
    preferred_date: str = Field(..., description="ISO date YYYY-MM-DD")
    sales_officer: str = Field("", max_length=100)
    taken_date: Optional[str] = Field(None, description="ISO date YYYY-MM-DD")
    recommendation_id: Optional[str] = None


class TestDriveUpdateIn(BaseModel):
    completed: Optional[bool] = None
    sales_officer: Optional[str] = Field(None, max_length=100)
    taken_date: Optional[str] = Field(None, description="ISO date YYYY-MM-DD or null to clear")


class TestDriveBookingOut(BaseModel):
    id: int
    message: str


class SearchRequest(BaseModel):
    q: str = Field(..., min_length=1, max_length=200, description="Natural-language search query")
    user_id: str = Field(..., min_length=1, max_length=64)
    k: int = Field(10, ge=1, le=30)


class SearchResponse(RecommendResponse):
    query: str
    parsed_tags: list[str]


class CustomerProfileIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    sub: str = Field("", max_length=200)
    budgetMin: float = Field(0, ge=0)
    budgetMax: float = Field(100, gt=0)
    fuels: list[str] = Field(default_factory=list)
    bodies: list[str] = Field(default_factory=list)
    trans: Literal["any", "automatic", "manual"] = "any"
    seats: str = Field("", max_length=2)
    features: list[str] = Field(default_factory=list)
    priorities: list[str] = Field(default_factory=list)


class CustomerProfile(CustomerProfileIn):
    id: str


class LoginIn(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)


class LoginOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
