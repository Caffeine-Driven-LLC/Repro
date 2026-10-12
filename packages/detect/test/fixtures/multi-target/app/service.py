import os
import pickle
import subprocess
import yaml


def run(cmd):
    return subprocess.call(cmd, shell=True)


def load(blob):
    return pickle.loads(blob)


def parse(text):
    return yaml.load(text)


def total(xs: list[int]) -> int:
    return sum(xs) + "1"


def handler(request, items=[]):
    items.append(request)
    return items
    print("never")


def compare(a):
    if a == None:
        return undefined_name
    return a
