from setuptools import setup, find_packages

setup(
    name="snakemake-logger-plugin-rnaflow",
    version="0.1.0",
    description="A custom logger plugin for RNAFlow Snakemake pipeline",
    author="JZHANG",
    packages=find_packages(),
    entry_points={
        "snakemake_logger_plugins": [
            "rnaflow = logger_plugin:LogHandler",
        ],
    },
    install_requires=[
        "snakemake-interface-logger-plugins",
        "loguru",
    ],
)