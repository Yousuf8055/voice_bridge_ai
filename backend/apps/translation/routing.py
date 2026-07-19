from django.urls import path
from . import consumers

websocket_urlpatterns = [
    path('ws/stream-stt/', consumers.STTStreamConsumer.as_asgi()),
]
