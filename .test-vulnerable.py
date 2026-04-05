import os

def process_file(filename):
    os.system(f"cat {filename}")
    return filename

user_input = input("File: ")
result = process_file(user_input)
