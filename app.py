from fastapi import FastAPI, UploadFile, File, Request
from fastapi.responses import StreamingResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
import pandas as pd
import io
import random
import json
import asyncio
from sse_starlette import EventSourceResponse

app = FastAPI()

# Подключаем статические файлы и шаблоны
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Глобальная переменная для хранения данных (временное решение, в продакшене лучше использовать Redis или БД)
global_data = {"df": None}

# Имитация работы агента
async def mock_agent(question, llm_answer, gold_answer):
    await asyncio.sleep(0.5)  # Асинхронная задержка
    is_correct = random.choice([True, False]) if llm_answer != gold_answer else llm_answer == gold_answer
    return {
        "info": "Ответ совпадает с эталоном" if is_correct else "Ответ отличается от эталона",
        "result": "верно" if is_correct else "неверно"
    }

@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    file_content = await file.read()
    df = pd.read_excel(io.BytesIO(file_content))
    global_data["df"] = df
    return {"message": "File uploaded, processing started"}

@app.get("/stream")
async def stream():
    async def event_generator():
        df = global_data.get("df")
        if df is None:
            yield {"event": "error", "data": json.dumps({"message": "No file uploaded"})}
            return

        total_rows = len(df)
        results = []

        for index, row in df.iterrows():
            response = await mock_agent(row["question"], row["llm_answer"], row["gold_answer"])
            result = {
                "question": row["question"],
                "llm_answer": row["llm_answer"],
                "gold_answer": row["gold_answer"],
                "info": response["info"],
                "result": response["result"]
            }
            results.append(result)
            # Отправляем строку
            yield {"event": "row", "data": json.dumps(result)}
            # Отправляем прогресс
            progress = ((index + 1) / total_rows) * 100
            yield {"event": "progress", "data": json.dumps({"progress": progress})}

        # После завершения отправляем accuracy
        correct_count = sum(1 for res in results if res["result"] == "верно")
        accuracy = (correct_count / len(results)) * 100 if results else 0
        yield {"event": "complete", "data": json.dumps({"accuracy": accuracy})}

    return EventSourceResponse(event_generator())

@app.post("/download")
async def download_file(data: dict):
    df = pd.DataFrame(data["data"])
    output = io.BytesIO()
    df.to_excel(output, index=False)
    output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": "attachment; filename=validation_results.xlsx"})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001)