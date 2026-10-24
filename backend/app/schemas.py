import re

from pydantic import BaseModel, Field, field_validator


class Verse(BaseModel):
    sadr: str = Field(min_length=2, max_length=240)
    ajuz: str = Field(min_length=2, max_length=240)

    @field_validator("sadr", "ajuz")
    @classmethod
    def arabic_text(cls, value: str) -> str:
        if not re.search(r"[\u0621-\u064a]", value):
            raise ValueError("Arabic text is required")
        return value.strip()


class VocalizedVerse(Verse):
    # Automatic vowels/shadda can triple the serialized character count.
    sadr: str = Field(min_length=2, max_length=720)
    ajuz: str = Field(min_length=2, max_length=720)


class Draft(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    verses: list[Verse] = Field(min_length=1, max_length=8)


class GenerateRequest(BaseModel):
    topic: str = Field(min_length=3, max_length=500)
    meter: str = "taweel"
    rawi: str = "م"
    verse_count: int = Field(default=3, ge=1, le=8)
    max_revisions: int = Field(default=2, ge=0, le=3)

    @field_validator("rawi")
    @classmethod
    def single_rawi(cls, value: str) -> str:
        if not re.fullmatch(r"[\u0621-\u063a\u0641-\u064a]", value):
            raise ValueError("Choose one Arabic rawi letter")
        return value


class AnalyzeRequest(BaseModel):
    auto_tashkeel: bool = True
    verses: list[Verse] = Field(min_length=1, max_length=8)
    meter: str = "taweel"
    rawi: str = "م"

    _rawi_validator = field_validator("rawi")(GenerateRequest.single_rawi.__func__)
