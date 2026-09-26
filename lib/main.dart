import 'package:flutter/material.dart';
import 'screens/login_screen.dart';

void main() {
  runApp(const OrchestratorApp());
}

class OrchestratorApp extends StatelessWidget {
  const OrchestratorApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'EventFlow Orchestrator',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        fontFamily: 'Roboto', // Default material font
        useMaterial3: true,
      ),
      home: const LoginScreen(),
    );
  }
}
