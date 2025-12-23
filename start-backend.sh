#!/bin/bash
cd backend
uvicorn api:app --reload --port 8000

