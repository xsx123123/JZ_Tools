#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Logo display helpers for the kegg_pull CLI.
"""

import random
import textwrap

from rich.align import Align
from rich.console import Console
from rich.text import Text

from .configuration import load_software_config

try:
    from rich_gradient import Gradient
    from rich_gradient import Text as GradientText

    GRADIENT_AVAILABLE = True
except ImportError:
    Gradient = None
    GradientText = None
    GRADIENT_AVAILABLE = False


class LogoDisplay:
    """Render a compact Rich logo for terminal startup."""

    GRADIENT_SCHEMES = {
        "ocean": ["#00CED1", "#1E90FF", "#000080"],
        "forest": ["#32CD32", "#228B22", "#006400"],
        "mint": ["#98FF98", "#00FA9A", "#00CED1"],
        "cyber": ["#00FFFF", "#00FF00", "#FFFF00"],
        "monochrome": ["#FFFFFF", "#808080", "#000000"],
    }

    def __init__(
        self,
        version: str = "v0.1.0",
        app_name: str = "kegg-pull",
        description: str = "Offline KEGG annotation downloader",
        url: str = "",
        rice_color: str = "bold cyan",
        gradient_colors: list[str] | None = None,
        use_gradient: bool = False,
        gradient_scheme: str | None = None,
    ):
        self.console = Console()
        self.app_name = app_name
        self.version = version
        self.description = description
        self.url = url
        self.rice_color = rice_color
        self.use_gradient = use_gradient and GRADIENT_AVAILABLE
        if gradient_scheme == "random":
            scheme_name = random.choice(list(self.GRADIENT_SCHEMES.keys()))
            self.gradient_colors = self.GRADIENT_SCHEMES[scheme_name]
        elif gradient_scheme and gradient_scheme in self.GRADIENT_SCHEMES:
            self.gradient_colors = self.GRADIENT_SCHEMES[gradient_scheme]
        elif gradient_colors:
            self.gradient_colors = gradient_colors
        else:
            self.gradient_colors = ["cyan", "green", "yellow"]

    def create_ascii_logo(self) -> str:
        logos = [
            r"""
            _  __ _____  ____  ____
           | |/ /| ____|/ ___|/ ___|
           | ' / |  _| | |  _| |  _
           | . \ | |___| |_| | |_| |
           |_|\_\|_____|\____|\____|
            """,
            r"""
           KEGG Pull
           Offline annotation downloader
            """,
        ]
        return textwrap.dedent(random.choice(logos)).strip("\n")

    def display_welcome_logo(self) -> None:
        url_line = f"\n{self.url}" if self.url else ""
        content = (
            f"{self.create_ascii_logo()}\n"
            f"{self.app_name}:{self.version}\n"
            f"{self.description}{url_line}"
        )
        if self.use_gradient and Gradient is not None:
            text = Gradient(content, colors=self.gradient_colors)
        else:
            text = Text(content, style=self.rice_color)
        self.console.print(text)

    def display_mini_logo(self) -> None:
        content = f"{self.app_name}:{self.version}"
        if self.use_gradient and GradientText is not None:
            mini_logo = GradientText(content, colors=self.gradient_colors)
        else:
            mini_logo = Text(content, style="bold cyan")
        self.console.print(Align.center(mini_logo))


def show_logo(
    style: str = "welcome",
    version: str = "v0.1.0",
    app_name: str = "kegg-pull",
    description: str = "Offline KEGG annotation downloader",
    url: str = "",
    rice_color: str = "bold cyan",
    use_gradient: bool = True,
    gradient_colors: list[str] | None = None,
    gradient_scheme: str = "random",
) -> None:
    """Display the configured command-line logo."""
    logo = LogoDisplay(
        version=version,
        app_name=app_name,
        description=description,
        url=url,
        rice_color=rice_color,
        use_gradient=use_gradient,
        gradient_colors=gradient_colors,
        gradient_scheme=gradient_scheme,
    )
    if style == "mini":
        logo.display_mini_logo()
    else:
        logo.display_welcome_logo()


def config2logo(config: dict | None = None) -> None:
    """Show the welcome logo using a config dict or package defaults."""
    if config is None:
        config = load_software_config()
    sw = config.get("software", config)
    show_logo(
        "welcome",
        version=sw.get("version", "unknown"),
        app_name=sw.get("app_name", "kegg-pull"),
        description=sw.get("description", ""),
        url=sw.get("url", ""),
        rice_color=sw.get("rice_color", "bold cyan"),
        use_gradient=True,
        gradient_scheme="random",
    )


if __name__ == "__main__":
    config2logo()
