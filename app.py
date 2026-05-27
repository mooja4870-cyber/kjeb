import streamlit as st
import streamlit.components.v1 as components
import requests
import sqlite3
import json
import os
import re

st.set_page_config(page_title="안심 병원 찾기", page_icon="🏥", layout="wide")

# Hide Streamlit Chrome
st.markdown("""
<style>
  #MainMenu {visibility: hidden;}
  header {visibility: hidden;}
  footer {visibility: hidden;}
  .stApp { margin: 0; padding: 0; }
  .block-container { padding: 0 !important; max-width: 100% !important; }
  iframe { width: 100%; height: 100vh; border: none; }
</style>
""", unsafe_allow_html=True)

NAVER_CLIENT_ID = os.environ.get("NAVER_CLIENT_ID", "PqOwK5a2oVVs6zmEOjWm")
NAVER_CLIENT_SECRET = os.environ.get("NAVER_CLIENT_SECRET", "SjK8rv8Nd7")

# Declare the component
# Streamlit will serve the 'frontend' folder statically
my_app = components.declare_component("my_app", path="frontend")

def fetch_data(query, display=20, sort="comment"):
    url = f"https://openapi.naver.com/v1/search/local.json?query={query}&display={display}&sort={sort}"
    headers = {
        "X-Naver-Client-Id": NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET
    }
    resp = requests.get(url, headers=headers)
    if resp.status_code != 200:
        return {"items": []}
    
    data = resp.json()
    if "items" not in data or not data["items"]:
        return data
    
    db_path = os.path.join(os.getcwd(), 'hira_data.db')
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        for item in data["items"]:
            clean_name = re.sub(r'<[^>]+>', '', item["title"]).split(' ')[0]
            cursor.execute("SELECT drTotCnt FROM hospitals WHERE yadmNm LIKE ?", (f"%{clean_name}%",))
            row = cursor.fetchone()
            if row:
                item["hiraData"] = {"doctorCnt": row[0]}
            else:
                item["hiraData"] = {"doctorCnt": 1}
        conn.close()
    except Exception as e:
        print(e)
    
    return data

if "search_results" not in st.session_state:
    st.session_state["search_results"] = None

# Render the component
val = my_app(results=st.session_state["search_results"])

# Check if JS sent a search request
if val and isinstance(val, dict) and val.get("action") == "search":
    query = val.get("query")
    display = val.get("display", 20)
    
    # Fetch API and DB data
    results = fetch_data(query, display, "comment")
    
    # Update session state and rerun to send results back to JS
    st.session_state["search_results"] = results
    
    # Streamlit requires a rerun to push the new state down to the component
    st.rerun()
