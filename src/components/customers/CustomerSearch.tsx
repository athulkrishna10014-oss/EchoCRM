import React from 'react'
import { Search, ArrowUpDown } from 'lucide-react'

interface CustomerSearchProps {
  search: string;
  onSearchChange: (val: string) => void;
  sortOrder: 'asc' | 'desc';
  onSortOrderChange: (val: 'asc' | 'desc') => void;
}

export const CustomerSearch: React.FC<CustomerSearchProps> = ({
  search,
  onSearchChange,
  sortOrder,
  onSortOrderChange
}) => {
  return (
    <div className="flex flex-col sm:flex-row gap-4 items-center justify-between w-full select-none">
      
      {/* 1. Search Bar */}
      <div className="relative w-full sm:max-w-md">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#817A72] pointer-events-none">
          <Search className="w-4 h-4" />
        </span>
        <input
          type="text"
          placeholder="Search by name, email, company, or phone..."
          aria-label="Search customers by name, email, company, or phone"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-[#FFFDF9] border border-[#E8E1D8] focus:border-[#B85C38] focus:ring-2 focus:ring-[#B85C38]/15 focus:outline-none rounded-xl text-sm text-[#292522] placeholder-[#817A72] transition duration-150"
        />
      </div>

      {/* 2. Sort Selection */}
      <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0 justify-end">
        <span className="text-xs font-semibold text-[#817A72] uppercase tracking-wider">Sort by name:</span>
        <div className="flex bg-[#FFFDF9] border border-[#E8E1D8] rounded-xl p-1 shadow-xs">
          {/* A-Z Button */}
          <button
            type="button"
            onClick={() => onSortOrderChange('asc')}
            aria-label="Sort ascending A to Z"
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              sortOrder === 'asc'
                ? 'bg-[#F0D8CA] text-[#B85C38] border border-[#B85C38]/20 shadow-xs'
                : 'text-[#817A72] hover:text-[#292522] border border-transparent'
            }`}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>A–Z</span>
          </button>
          {/* Z-A Button */}
          <button
            type="button"
            onClick={() => onSortOrderChange('desc')}
            aria-label="Sort descending Z to A"
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              sortOrder === 'desc'
                ? 'bg-[#F0D8CA] text-[#B85C38] border border-[#B85C38]/20 shadow-xs'
                : 'text-[#817A72] hover:text-[#292522] border border-transparent'
            }`}
          >
            <ArrowUpDown className="w-3.5 h-3.5 rotate-180" />
            <span>Z–A</span>
          </button>
        </div>
      </div>

    </div>
  )
}
