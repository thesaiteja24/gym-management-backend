/* eslint-disable max-lines */
export const CSS_THEME = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');

  body, .swagger-ui {
    font-family: 'Inter', sans-serif !important;
    background-color: #0b0f19 !important;
    color: #f1f5f9 !important;
  }

  .swagger-ui .topbar {
    background-color: #070a13 !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    padding: 14px 0;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }
  .swagger-ui .topbar a span {
    font-family: 'Outfit', sans-serif !important;
    font-weight: 700 !important;
    color: #ffffff !important;
    letter-spacing: -0.5px;
  }

  .swagger-ui .info {
    margin: 36px 0 !important;
  }
  .swagger-ui .info .title {
    font-family: 'Outfit', sans-serif !important;
    font-weight: 700 !important;
    color: #ffffff !important;
    font-size: 2.2rem !important;
    letter-spacing: -0.5px;
  }
  .swagger-ui .info p, .swagger-ui .info li {
    color: #94a3b8 !important;
    font-size: 0.95rem !important;
    line-height: 1.6;
  }

  .swagger-ui .opblock-tag {
    font-family: 'Outfit', sans-serif !important;
    font-size: 1.3rem !important;
    font-weight: 600 !important;
    color: #ffffff !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
    padding: 12px 0 !important;
    margin: 24px 0 12px 0 !important;
  }
  .swagger-ui .opblock-tag small {
    color: #64748b !important;
    font-size: 0.9rem !important;
    font-weight: 400 !important;
    margin-left: 8px;
  }

  .swagger-ui .opblock {
    border-radius: 10px !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
    border: 1px solid rgba(255, 255, 255, 0.04) !important;
    margin: 0 0 10px 0 !important;
    transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1) !important;
    background: rgba(255, 255, 255, 0.01) !important;
    backdrop-filter: blur(12px);
  }
  .swagger-ui .opblock:hover {
    transform: translateY(-1.5px);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
  }

  .swagger-ui .opblock.opblock-get {
    background: rgba(147, 51, 234, 0.03) !important;
  }
  .swagger-ui .opblock.opblock-get .opblock-summary {
    border-color: rgba(147, 51, 234, 0.08) !important;
  }
  .swagger-ui .opblock.opblock-get .opblock-summary-method {
    background: #8b5cf6 !important;
    color: #ffffff !important;
    border-radius: 5px !important;
    font-weight: 600 !important;
  }

  .swagger-ui .opblock.opblock-post {
    background: rgba(16, 185, 129, 0.03) !important;
  }
  .swagger-ui .opblock.opblock-post .opblock-summary {
    border-color: rgba(16, 185, 129, 0.08) !important;
  }
  .swagger-ui .opblock.opblock-post .opblock-summary-method {
    background: #10b981 !important;
    color: #ffffff !important;
    border-radius: 5px !important;
    font-weight: 600 !important;
  }

  .swagger-ui .opblock.opblock-put {
    background: rgba(245, 158, 11, 0.03) !important;
  }
  .swagger-ui .opblock.opblock-put .opblock-summary {
    border-color: rgba(245, 158, 11, 0.08) !important;
  }
  .swagger-ui .opblock.opblock-put .opblock-summary-method {
    background: #f59e0b !important;
    color: #ffffff !important;
    border-radius: 5px !important;
    font-weight: 600 !important;
  }

  .swagger-ui .opblock.opblock-patch {
    background: rgba(20, 184, 166, 0.03) !important;
  }
  .swagger-ui .opblock.opblock-patch .opblock-summary {
    border-color: rgba(20, 184, 166, 0.08) !important;
  }
  .swagger-ui .opblock.opblock-patch .opblock-summary-method {
    background: #14b8a6 !important;
    color: #ffffff !important;
    border-radius: 5px !important;
    font-weight: 600 !important;
  }

  .swagger-ui .opblock.opblock-delete {
    background: rgba(239, 68, 68, 0.03) !important;
  }
  .swagger-ui .opblock.opblock-delete .opblock-summary {
    border-color: rgba(239, 68, 68, 0.08) !important;
  }
  .swagger-ui .opblock.opblock-delete .opblock-summary-method {
    background: #ef4444 !important;
    color: #ffffff !important;
    border-radius: 5px !important;
    font-weight: 600 !important;
  }

  .swagger-ui .opblock .opblock-summary-path {
    color: #ffffff !important;
    font-weight: 500 !important;
    font-size: 0.95rem !important;
  }
  .swagger-ui .opblock .opblock-summary-description {
    color: #94a3b8 !important;
    font-size: 0.85rem !important;
  }

  .swagger-ui .opblock-body {
    background: rgba(255, 255, 255, 0.005) !important;
    padding: 20px !important;
    border-top: 1px solid rgba(255, 255, 255, 0.05) !important;
  }

  .swagger-ui table thead tr th {
    color: #e2e8f0 !important;
    font-family: 'Outfit', sans-serif !important;
    border-bottom: 2px solid rgba(255, 255, 255, 0.08) !important;
    font-size: 0.9rem !important;
    font-weight: 600 !important;
    padding: 10px !important;
  }
  .swagger-ui table tbody tr td {
    padding: 12px 10px !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04) !important;
    color: #cbd5e1 !important;
    vertical-align: middle !important;
  }

  .swagger-ui .parameter__name {
    font-family: 'Inter', monospace !important;
    font-weight: 600 !important;
    color: #ffffff !important;
  }
  .swagger-ui .parameter__name.required::after {
    color: #ef4444 !important;
    font-size: 1.1rem !important;
  }
  .swagger-ui .parameter__type {
    font-family: monospace !important;
    font-size: 0.8rem !important;
    background: rgba(255, 255, 255, 0.05) !important;
    color: #94a3b8 !important;
    padding: 2px 6px !important;
    border-radius: 4px !important;
    border: 1px solid rgba(255, 255, 255, 0.03) !important;
  }

  .swagger-ui .btn.try-out__btn {
    background: rgba(99, 102, 241, 0.1) !important;
    color: #818cf8 !important;
    border: 1px solid rgba(99, 102, 241, 0.3) !important;
    font-weight: 600 !important;
    border-radius: 5px !important;
    padding: 6px 14px !important;
    transition: all 0.15s ease !important;
  }
  .swagger-ui .btn.try-out__btn:hover {
    background: rgba(99, 102, 241, 0.2) !important;
    border-color: #818cf8 !important;
  }

  .swagger-ui .btn.execute {
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%) !important;
    color: #ffffff !important;
    border: none !important;
    border-radius: 5px !important;
    font-weight: 600 !important;
    letter-spacing: 0.5px !important;
    padding: 10px 24px !important;
    box-shadow: 0 4px 15px rgba(99, 102, 241, 0.25) !important;
    transition: all 0.2s ease !important;
  }
  .swagger-ui .btn.execute:hover {
    transform: translateY(-1px) !important;
    box-shadow: 0 6px 20px rgba(99, 102, 241, 0.35) !important;
    background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%) !important;
  }

  .swagger-ui .btn.clear {
    background: rgba(239, 68, 68, 0.08) !important;
    color: #f87171 !important;
    border: 1px solid rgba(239, 68, 68, 0.2) !important;
    border-radius: 5px !important;
    padding: 8px 18px !important;
    font-weight: 500 !important;
    transition: all 0.15s ease !important;
  }
  .swagger-ui .btn.clear:hover {
    background: rgba(239, 68, 68, 0.15) !important;
    border-color: #f87171 !important;
  }

  .swagger-ui .response-col_status-code {
    font-family: 'Outfit', sans-serif !important;
    font-weight: 600 !important;
    font-size: 0.9rem !important;
    padding: 4px 8px !important;
    border-radius: 5px !important;
  }
  .swagger-ui .response-col_status-code.status-2xx, 
  .swagger-ui .response-col_status-code[data-status="200"], 
  .swagger-ui .response-col_status-code[data-status="201"] {
    background: rgba(16, 185, 129, 0.1) !important;
    color: #34d399 !important;
    border: 1px solid rgba(16, 185, 129, 0.15) !important;
  }
  .swagger-ui .response-col_status-code.status-4xx,
  .swagger-ui .response-col_status-code[data-status="400"],
  .swagger-ui .response-col_status-code[data-status="401"],
  .swagger-ui .response-col_status-code[data-status="403"],
  .swagger-ui .response-col_status-code[data-status="404"] {
    background: rgba(245, 158, 11, 0.1) !important;
    color: #fbbf24 !important;
    border: 1px solid rgba(245, 158, 11, 0.15) !important;
  }
  .swagger-ui .response-col_status-code.status-5xx,
  .swagger-ui .response-col_status-code[data-status="500"] {
    background: rgba(239, 68, 68, 0.1) !important;
    color: #f87171 !important;
    border: 1px solid rgba(239, 68, 68, 0.15) !important;
  }

  .swagger-ui pre.microlight, .swagger-ui .highlight-code pre {
    background-color: #070a13 !important;
    border: 1px solid rgba(255, 255, 255, 0.05) !important;
    border-radius: 8px !important;
    padding: 16px !important;
    font-family: monospace !important;
    color: #cbd5e1 !important;
    box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.5) !important;
  }
  
  .swagger-ui pre::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  .swagger-ui pre::-webkit-scrollbar-track {
    background: #070a13;
  }
  .swagger-ui pre::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  }
  .swagger-ui pre::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .swagger-ui .tab {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }
  .swagger-ui .tab li {
    padding: 0 !important;
  }
  .swagger-ui .tab li button.tablinks {
    font-family: 'Outfit', sans-serif !important;
    font-size: 0.85rem !important;
    font-weight: 500 !important;
    color: #94a3b8 !important;
    background: transparent !important;
    border: none !important;
    border-bottom: 2px solid transparent !important;
    padding: 6px 12px !important;
    transition: all 0.15s ease !important;
  }
  .swagger-ui .tab li button.tablinks.active {
    color: #818cf8 !important;
    border-bottom: 2px solid #818cf8 !important;
  }

  .swagger-ui select, .swagger-ui input[type=text], .swagger-ui textarea {
    background-color: #1e293b !important;
    color: #ffffff !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-radius: 5px !important;
    padding: 6px 10px !important;
  }
  .swagger-ui .btn {
    background: #6366f1 !important;
    color: #ffffff !important;
    border: none !important;
    border-radius: 5px !important;
    font-weight: 500 !important;
  }
  .swagger-ui .btn:hover {
    background: #4f46e5 !important;
  }
  .swagger-ui .btn.cancel {
    background: rgba(239, 68, 68, 0.2) !important;
    color: #ef4444 !important;
  }

  .swagger-ui .scheme-container {
    background: rgba(255, 255, 255, 0.01) !important;
    border: 1px solid rgba(255, 255, 255, 0.04) !important;
    border-radius: 10px !important;
    padding: 16px !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
  }
  .swagger-ui .btn.authorize {
    background: transparent !important;
    color: #10b981 !important;
    border: 2px solid #10b981 !important;
    border-radius: 5px !important;
  }
  .swagger-ui .btn.authorize svg {
    fill: #10b981 !important;
  }

  .swagger-ui section.models {
    border: 1px solid rgba(255, 255, 255, 0.04) !important;
    border-radius: 10px !important;
    background: rgba(255, 255, 255, 0.01) !important;
  }
  .swagger-ui section.models h4 {
    color: #ffffff !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04) !important;
    font-family: 'Outfit', sans-serif !important;
  }
  .swagger-ui .model-box {
    background-color: transparent !important;
  }
`
