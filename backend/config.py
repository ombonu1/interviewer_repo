import os
from google import genai
from google.cloud import bigquery
from dotenv import load_dotenv

load_dotenv()


GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

if GOOGLE_API_KEY is None:
    raise ValueError("Can't find the API Key LOL")

DEFAULT_MODEL = "gemini-2.5-flash"

adk_client = genai.Client(api_key=GOOGLE_API_KEY)