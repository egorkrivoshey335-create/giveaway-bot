'use client';

import { motion } from 'framer-motion';

export interface TabBarProps {
  tabs: Array<{
    id: string;
    label: string;
    icon?: string;
  }>;
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

/**
 * TabBar — переключатель табов
 * 
 * @example
 * ```tsx
 * <TabBar
 *   tabs={[
 *     { id: 'participant', label: 'Участник', icon: '🎫' },
 *     { id: 'creator', label: 'Создатель', icon: '🎁' },
 *   ]}
 *   activeTab={activeTab}
 *   onChange={setActiveTab}
 * />
 * ```
 */
export function TabBar({ tabs, activeTab, onChange, className = '' }: TabBarProps) {
  return (
    <div className={`flex gap-2 p-2 bg-tg-bg rounded-xl ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;

        return (
          <motion.button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`
              flex-1 py-3 px-4 rounded-xl font-medium text-sm transition-colors
              ${isActive ? 'bg-brand text-white' : 'bg-tg-secondary text-tg-text hover:bg-tg-secondary/80'}
            `}
            whileTap={{ scale: 0.98 }}
          >
            {tab.icon && <span className="mr-2">{tab.icon}</span>}
            {tab.label}
          </motion.button>
        );
      })}
    </div>
  );
}
