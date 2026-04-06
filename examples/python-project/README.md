# Python Project Example

This example demonstrates agents-runtime analyzing Python code.

## What's inside

- `app/` - Python source code with intentional issues
- `requirements.txt` - Python dependencies
- `README.md` - This file

## Quick start

```bash
cd examples/python-project

# Set up agents-runtime
npm run setup

# Analyze Python code
agents analyze app/

# Security audit
agents audit app/
```

## Issues in the code

The Python files contain examples of:

- **SQL Injection** - Direct string concatenation in queries
- **Command Injection** - Using `shell=True` in subprocess
- **Hardcoded Secrets** - API keys in source code
- **Insecure Deserialization** - Using `pickle.loads()`
- **Weak Cryptography** - MD5 hashing for passwords
- **High Complexity** - Deep nested conditions

## Learning

This example shows how agents-runtime can analyze:
- Both Python and JavaScript in the same project
- OWASP security patterns
- Code complexity metrics
- DRY violations

## Next steps

See `../../README.md` for complete documentation.
