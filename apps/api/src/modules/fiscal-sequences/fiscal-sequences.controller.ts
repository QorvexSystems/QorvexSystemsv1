import { Controller, Get, UseGuards } from '@nestjs/common';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { FiscalSequencesService } from './fiscal-sequences.service';

@Controller('fiscal-sequences')
@UseGuards(JwtAuthGuard, TenantMembershipGuard)
export class FiscalSequencesController {
  constructor(private readonly fiscalSequencesService: FiscalSequencesService) {}

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.fiscalSequencesService.findAll(tenantId);
  }
}
