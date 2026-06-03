import React from 'react';
import RecordListScreen from './RecordListScreen';
import { listWarranties } from '../api';

export default function WarrantiesScreen() {
  return <RecordListScreen fetcher={listWarranties} emptyText="No warranties yet." />;
}
