import 'package:web_socket_channel/web_socket_channel.dart';
import 'dart:convert';

class WebSocketService {
  WebSocketChannel? _channel;
  
  // TODO: Replace with P3's WebSocket endpoint
  final String wsUrl = 'ws://127.0.0.1:8000/ws/alerts';

  void connect() {
    try {
      _channel = WebSocketChannel.connect(Uri.parse(wsUrl));
    } catch (e) {
      print("WebSocket Connection Failed: $e");
    }
  }

  Stream<Map<String, dynamic>> get alertStream {
    if (_channel == null) return const Stream.empty();
    return _channel!.stream.map((event) => jsonDecode(event as String));
  }

  void disconnect() {
    _channel?.sink.close();
    _channel = null;
  }
}