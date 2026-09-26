// lib/screens/login_screen.dart
import 'package:flutter/material.dart';
import '../models/user.dart';
import 'visitor_map_screen.dart';
import 'coordinator_dashboard.dart';

class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  void _login(BuildContext context, UserRole role) {
    // In a real app, integrate API auth here. 
    // For now, we mock the successful login and route.
    if (role == UserRole.visitor) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const VisitorMapScreen()),
      );
    } else {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const CoordinatorDashboard()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('EventFlow Login')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            ElevatedButton(
              onPressed: () => _login(context, UserRole.visitor),
              child: const Text('Enter as Visitor'),
            ),
            const SizedBox(height: 20),
            OutlinedButton(
              onPressed: () => _login(context, UserRole.coordinator),
              child: const Text('Coordinator Login'),
            ),
          ],
        ),
      ),
    );
  }
}