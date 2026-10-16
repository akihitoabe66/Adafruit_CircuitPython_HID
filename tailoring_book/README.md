# テーラーを目指す人のための スーツ仕立て教本

- `tailoring_book.pdf` … 本編（A4・両面・左綴じ想定、74ページ、目次・しおりにハイパーリンク付き）
- `measurement_forms.pdf` … コピー用の採寸フォーム3ページ（ジャケット／トラウザーズ・スタイル／仮縫い記録）

## 再生成

```
pip install weasyprint pypdf
# 日本語フォント（Noto Serif/Sans CJK JP）が必要
python3 build.py
```

本文は `src/*.html`、図版は `diagrams.py`、スタイルは `style.css`。
