FROM ubuntu:latest
RUN apt-get update && apt-get install -y curl
ADD app /app
RUN cd /app && pip install -r requirements.txt
CMD python app/service.py
