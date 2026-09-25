import 'package:flutter/material.dart';
import 'dart:convert';
import 'dart:async';

void main() {
  runApp(const EventFlowApp());
}

class EventFlowApp extends StatelessWidget {
  const EventFlowApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'EventFlow',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(primarySwatch: Colors.blue, useMaterial3: true),
      home: const LoginScreen(),
    );
  }
}

enum UserRole { visitor, coordinator }

// ==========================================
// MOCKED API SERVICES (Prevents Black Screen)
// ==========================================
class ApiService {
  static Future<bool> loginUser(String role) async {
    // Simulating a 1-second network delay to P3 Backend
    await Future.delayed(const Duration(seconds: 1));
    return true; 
  }

  static Future<bool> reportIncident(String zone, String issue) async {
    await Future.delayed(const Duration(seconds: 1));
    return true;
  }
}

class WebSocketService {
  final _controller = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get alertStream => _controller.stream;

  void connect() {
    // Simulating P2 AI engine sending an alert after 3 seconds
    Future.delayed(const Duration(seconds: 3), () {
      _controller.add({'message': 'Gate A is highly congested. Rerouting via Path B.'});
    });
  }

  void disconnect() {
    _controller.close();
  }
}

// ==========================================
// SCREENS
// ==========================================
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  bool _isLoading = false;

  Future<void> _login(UserRole role) async {
    setState(() => _isLoading = true);
    
    final roleString = role == UserRole.visitor ? 'visitor' : 'coordinator';
    
    // Call our mocked P3 Backend
    final success = await ApiService.loginUser(roleString);
    
    if (!mounted) return;
    setState(() => _isLoading = false);

    if (success) {
      Widget nextScreen = role == UserRole.visitor ? const VisitorMapScreen() : const CoordinatorDashboard();
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => nextScreen));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[100],
      appBar: AppBar(title: const Text('EventFlow Login'), centerTitle: true),
      body: Center(
        child: _isLoading 
          ? const CircularProgressIndicator() // Shows a loading spinner while "logging in"
          : Container(
              padding: const EdgeInsets.all(32),
              decoration: BoxDecoration(
                color: Colors.white, 
                borderRadius: BorderRadius.circular(16),
                boxShadow: const [BoxShadow(color: Colors.black12, blurRadius: 10)]
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.hub, size: 64, color: Colors.blue),
                  const SizedBox(height: 32),
                  ElevatedButton.icon(
                    icon: const Icon(Icons.person),
                    label: const Text('Enter as Visitor'),
                    style: ElevatedButton.styleFrom(minimumSize: const Size(250, 50)),
                    onPressed: () => _login(UserRole.visitor),
                  ),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    icon: const Icon(Icons.admin_panel_settings),
                    label: const Text('Coordinator Login'),
                    style: OutlinedButton.styleFrom(minimumSize: const Size(250, 50)),
                    onPressed: () => _login(UserRole.coordinator),
                  ),
                ],
              ),
            ),
      ),
    );
  }
}

class VisitorMapScreen extends StatefulWidget {
  const VisitorMapScreen({super.key});
  @override
  State<VisitorMapScreen> createState() => _VisitorMapScreenState();
}

class _VisitorMapScreenState extends State<VisitorMapScreen> {
  String? _currentAlert;
  final WebSocketService _wsService = WebSocketService();

  @override
  void initState() {
    super.initState();
    _wsService.connect();
    
    _wsService.alertStream.listen((data) {
      if (mounted && data.containsKey('message')) {
        setState(() => _currentAlert = data['message']);
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
      appBar: AppBar(
        title: const Text('Active Route'), 
        backgroundColor: Colors.blue,
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const LoginScreen())),
          )
        ],
      ),
      body: Stack(
        children: [
          Container(
            color: Colors.green[100], 
            child: const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.map, size: 100, color: Colors.green),
                  Text('Interactive Map View Rendered Here', style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
                ]
              )
            )
          ),
          if (_currentAlert != null)
            Positioned(
              top: 16, left: 16, right: 16,
              child: Material(
                elevation: 6,
                color: Colors.red[600],
                borderRadius: BorderRadius.circular(12),
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Row(
                    children: [
                      const Icon(Icons.warning, color: Colors.white),
                      const SizedBox(width: 12),
                      Expanded(child: Text(_currentAlert!, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold))),
                      IconButton(icon: const Icon(Icons.close, color: Colors.white), onPressed: () => setState(() => _currentAlert = null))
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

class CoordinatorDashboard extends StatelessWidget {
  const CoordinatorDashboard({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Coordinator Command'), 
        backgroundColor: Colors.blueGrey[900],
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const LoginScreen())),
          )
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16.0),
        children: [
          const Card(child: ListTile(leading: Icon(Icons.people_alt, color: Colors.orange, size: 36), title: Text('Zone A Capacity: 85%', style: TextStyle(fontWeight: FontWeight.bold)), subtitle: Text('Approaching bottleneck threshold'), trailing: Icon(Icons.warning, color: Colors.orange))),
          const Card(child: ListTile(leading: Icon(Icons.check_circle, color: Colors.green, size: 36), title: Text('Zone B Capacity: 40%', style: TextStyle(fontWeight: FontWeight.bold)), subtitle: Text('Flow is normal'))),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            icon: const Icon(Icons.report_problem),
            label: const Padding(padding: EdgeInsets.all(12.0), child: Text('Report Zone A Incident to AI Engine')),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red[50], foregroundColor: Colors.red[900]),
            onPressed: () async {
              bool success = await ApiService.reportIncident('Zone A', 'Bottleneck detected');
              if (success && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Reported. AI recalculating...')));
              }
            },
          )
        ],
      ),
    );
  }
}