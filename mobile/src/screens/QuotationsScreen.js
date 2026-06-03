import React from 'react';
import RecordListScreen from './RecordListScreen';
import { listQuotations } from '../api';

export default function QuotationsScreen() {
  return <RecordListScreen fetcher={listQuotations} emptyText="No quotations yet." />;
}
