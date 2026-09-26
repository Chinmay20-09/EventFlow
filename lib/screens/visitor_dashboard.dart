import 'package:flutter/material.dart';
import '../models/orchestrator_models.dart';
import '../services/websocket_service.dart';
import 'login_screen.dart';

class VisitorDashboard extends StatefulWidget {
  final String email;
  const VisitorDashboard({super.key, required this.email});

  @override
  State<VisitorDashboard> createState() => _VisitorDashboardState();
}

class _VisitorDashboardState extends State<VisitorDashboard> {
  final WebSocketService _wsService = WebSocketService();
  AlertMessage? _activeAlert;
  String _currentRoute = "Node Alpha -> Main Stage";

  @override
  void initState() {
    super.initState();
    _wsService.connect(widget.email, UserRole.visitor);
    _wsService.alertStream.listen((alert) {
      if (mounted) {
        setState(() {
          _activeAlert = alert;
          if (alert.newRoute != null) _currentRoute = alert.newRoute!;
        });
      }
    });
  }

  @override
  void dispose() {
    _wsService.disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text(
          'Live Navigation',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.exit_to_app, color: Colors.white),
            onPressed: () => Navigator.pushReplacement(
              context,
              MaterialPageRoute(builder: (_) => const LoginScreen()),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          if (_activeAlert != null)
            Container(
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: _activeAlert!.severity == 'critical'
                    ? Colors.redAccent
                    : Colors.orangeAccent,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color:
                        (_activeAlert!.severity == 'critical'
                                ? Colors.red
                                : Colors.orange)
                            .withOpacity(0.5),
                    blurRadius: 10,
                  ),
                ],
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.warning_amber_rounded,
                    color: Colors.white,
                    size: 32,
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'AI DIRECTIVE: ${_activeAlert!.zone}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 12,
                          ),
                        ),
                        Text(
                          _activeAlert!.message,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.check_circle, color: Colors.white),
                    onPressed: () => setState(() => _activeAlert = null),
                  ),
                ],
              ),
            ),

          Expanded(
            child: Container(
              margin: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: const Color(0xFF38BDF8).withOpacity(0.3),
                  width: 2,
                ),
              ),
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(
                      Icons.polyline_rounded,
                      size: 100,
                      color: Color(0xFF38BDF8),
                    ),
                    const SizedBox(height: 20),
                    const Text(
                      'ACTIVE ROUTE GUIDANCE',
                      style: TextStyle(
                        color: Color(0xFF94A3B8),
                        letterSpacing: 1.5,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _currentRoute,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
