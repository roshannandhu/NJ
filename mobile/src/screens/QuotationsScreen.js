import React from 'react';
import RecordListScreen from './RecordListScreen';
import { listQuotations } from '../api';

export default function QuotationsScreen({ navigation }) {
  return (
    <RecordListScreen
      fetcher={listQuotations}
      emptyText="No quotations yet."
      onPressItem={(q) => navigation.navigate('QuotationDocument', { quotation: q })}
    />
  );
}
