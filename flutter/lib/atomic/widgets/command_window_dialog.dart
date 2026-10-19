import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class CommandWindowDialog extends StatelessWidget {
  final String content;
  const CommandWindowDialog({super.key, required this.content});

  static Future<void> show(BuildContext context, String content) {
    return showDialog<void>(
      context: context,
      builder: (_) => CommandWindowDialog(content: content),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Command Window'),
      content: SizedBox(
        width: 460,
        child: SingleChildScrollView(
          child: SelectableText(
            content,
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 12,
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () {
            Clipboard.setData(ClipboardData(text: content));
            Navigator.pop(context);
          },
          child: const Text('Copy & Close'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Close'),
        ),
      ],
    );
  }
}
