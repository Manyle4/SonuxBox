# SonuxBox
A custom simage to audio sonification engine built entirely in C++, packaged and hosted as a website backend.

# API_URL
The model's api is hosted 


# Endpoints
| Method | Endpoint                  | Description                             |
|--------|---------------------------|-----------------------------------------|
| GET   | `/api/health`                | Sends a request to the ML model to make a prediction  | 
| POST   | `/api/analyze`                | Accepts an image as either raw bytes or javaScript FormData  | 

# Output
The synthesizer engine produces the audio as a WAV file and a corresponding JSON file for each image sent.